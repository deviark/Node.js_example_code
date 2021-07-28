import { AccessTokenService } from '../_services/access-token.service';
import { UserService } from '../_services/user.service';
import { ChatService } from '../_services/chat.service';
import { MessageService } from '../_services/message.service';

export default (server: any) => {

  const accessTokenService: AccessTokenService = new AccessTokenService();
  const userService: UserService = new UserService();
  const chatService: ChatService = new ChatService();
  const messageService: MessageService = new MessageService();  

  const maxAllowedLum: number = 80;

  /*
  * generator random color in RGB schema with a threshold luminance
  * @param {Number} [maxAllowedLuminance] threshold luminance
  * @return {String} css style color in rgb format
  */
  const colorGen = (maxAllowedLuminance: number) => {
    let luminance, R, G, B;
    do {
      R = Math.floor(Math.random() * 256);
      B = Math.floor(Math.random() * 256);
      G = Math.floor(Math.random() * 256);
      luminance = 0.4 * R + 0.2 * G + 0.4 * B;
    }
    while (luminance <= maxAllowedLuminance)
    return `rgb(${R}, ${G}, ${B})`;
  }

  const chatOnLineUsers = new Set();

  const io = require('socket.io')(server, {
    perMessageDeflate: false,
    path: '/chat',
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
      credentials: true
    },
    reconnect: true,
    secure: true,
    rejectUnauthorized: false
  });

  /*
  * const chatOnLineUsers Set({String}) - accumulator for control on-line users, there are user's _ids
  */
  io.on('connection', async (socket: any) => {  

    const emitUsersList = async (chatId: String) => {
      const chat = await chatService.getChatByChatId(<string>chatId);
      const chatData = { ...JSON.parse(JSON.stringify(chat)) }; // remove mongodb immutable
      chatData && chatData.users && chatData.users.forEach((user: any) => {
        user.isOnline = chatOnLineUsers.has(user.userId);
      });
      chatData && chatData.users && socket.emit('users:list', chatData.users);
    };

    const emitMessagesList = async (chatId: String) => {
      const messages = await messageService.getChatMessages(<string>chatId);
      socket.emit('messages:list', messages);
    }

    socket.on('chat:join', async (data: any) => {
      const userData = await accessTokenService.verify(data.token);
      const chatId = data.chatId;
      const chatName = data.chatName;
      const chat = await chatService.getChatByChatId(<string>chatId);
      chatOnLineUsers.add(userData._id);
      if (chat) {
        // chat already exists
        const userInChat = chat.users.some((user: any) => user.userId === userData._id);
        if (userInChat) {
          // user already in the chat
        } else {
          // new user will be added to the chat
          await chatService.addUserToChat({
            chatId: chatId,
            user: {
              userId: userData._id,
              userName: userData.userName,
              color: colorGen(maxAllowedLum)
            }
          });
        }
      } else {
        // new chat, will be created
        await chatService.create({
          name: chatName || '',
          chatId: chatId,
          users: [{
            userId: userData._id,
            userName: userData.userName,
            color: colorGen(maxAllowedLum)
          }]
        });
      }
      emitUsersList(chatId);
      emitMessagesList(chatId);
    });

    socket.on('message:add', async (data: any) => {
      const user = await userService.findOne({ _id: data.userId });
      await messageService.create({
        chatId: data.chatId,
        messageText: data.messageText,
        userId: data.userId,
        senderName: user.userName,
        color: colorGen(maxAllowedLum)
      })
      emitMessagesList(data.chatId);
    });

    socket.on('message:remove', async (data: any) => {
      await messageService.delete({ _id: data.messageId });
      emitMessagesList(data.chatId);
    });

    socket.on('chat:leave', async (data: any) => {
      const userData = await accessTokenService.verify(data.token);
      chatOnLineUsers.delete(userData._id);
      emitUsersList(data.chatId);
    })

    socket.on('disconnect', async () => {
      destroy();
    })

    const destroy = () => {
      try {
        socket.disconnect();
        socket.removeAllListeners();
        socket = null; //this will kill all event listeners working with socket
        console.log('disconnect destroy')
        for (let user of chatOnLineUsers) {
          chatOnLineUsers.delete(user);
        }
      } catch (error) {
        console.log('ERROR socket destroy ', error);
      }
    }
  });

}