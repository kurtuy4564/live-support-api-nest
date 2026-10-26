import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Подключились к серверу!');
  console.log('Socket ID:', socket.id);
});

socket.on('disconnect', (reason) => {
  console.log('Соединение закрыто:', reason);
});

socket.on('connect_error', (error) => {
  console.error('Ошибка подключения:', error.message);
});
