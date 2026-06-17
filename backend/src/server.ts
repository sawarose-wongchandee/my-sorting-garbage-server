import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const rooms = new Map<string, any>();

// ฟังก์ชันสุ่มกระจายขยะจำลองในสนาม
function generateTrash() {
  const types = ['plastic', 'paper', 'metal'];
  const items = [];
  for (let i = 0; i < 25; i++) {
    items.push({
      id: `trash_${Math.random().toString(36).substring(2, 9)}`,
      type: types[i % types.length],
      x: Math.floor(Math.random() * 300) + 240,
      y: Math.floor(Math.random() * 440) + 100
    });
  }
  return items;
}

// ระบบจัดการเครือข่ายสัญญาณเมื่อมีการเชื่อมต่อเข้ามา
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 🌟 1. ฟังก์ชันรองรับเมื่อคุณครูกดปุ่ม "สร้างห้องแข่งขันใหม่" (จัดตำแหน่งถูกต้องแล้ว)
  socket.on('createRoom', (callback) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let roomCode = "";
    for (let i = 0; i < 4; i++) {
      roomCode += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    }

    const room = {
      roomCode,
      status: 'playing',
      players: {},
      trashItems: generateTrash()
    };
    
    rooms.set(roomCode, room);
    console.log(`Room Created Successfully: ${roomCode}`);
    
    // ส่งสัญญาณตอบกลับหน้าบ้านเพื่อแจ้งรหัสห้อง
    callback({ success: true, roomCode });
  });

  // 🎮 2. ฟังก์ชันรองรับเมื่อมีผู้เล่นกดปุ่มเข้าร่วมห้องเกม
  socket.on('joinRoom', ({ roomCode, teamName }, callback) => {
    const targetCode = roomCode ? roomCode.toUpperCase() : '';
    let room = rooms.get(targetCode);
    
    // หากไม่พบห้องในระบบหลังบ้าน (กรณีใช้โหมดซ้อมด่วน หรือเซิร์ฟเวอร์เพิ่งรีบูต)
    if (!room) {
      room = {
        roomCode: targetCode || 'TEST',
        status: 'playing',
        players: {},
        trashItems: generateTrash()
      };
      rooms.set(room.roomCode, room);
    }

    // จัดวางตำแหน่งเด็กๆ 2 คนไม่ให้เกิดทับกัน (คนแรกมุมขวาล่าง, คนที่สองมุมขวาบน)
    const playerColors = [0xffa500, 0x00ffff]; // สีส้มหุ่นเรา, สีฟ้าหุ่นเพื่อน
    const playerCount = Object.keys(room.players).length;
    const color = playerColors[playerCount % playerColors.length];
    const startX = 540;
    const startY = playerCount === 0 ? 500 : 120;

    const newPlayer = {
      socketId: socket.id,
      teamName: teamName || `Player ${playerCount + 1}`,
      x: startX,
      y: startY,
      angle: 0,
      color: color,
      score: 0
    };

    room.players[socket.id] = newPlayer;
    socket.join(room.roomCode);

    // กระจายสัญญาณบอกเพื่อนในห้องว่ามีเราแอนิเมชันเพิ่มขึ้นมาแล้ว
    socket.to(room.roomCode).emit('peerJoined', newPlayer);

    // ส่งชุดข้อมูลขยะและรายชื่อผู้เล่นทั้งหมดกลับไปแสดงผลบนหน้าจอเรา
    callback({ 
      success: true, 
      trashItems: room.trashItems,
      currentPlayers: Object.values(room.players),
      myId: socket.id
    });
  });

  // 🔄 3. อัปเดตพิกัดตำแหน่งและการหมุนของตัวหุ่นยนต์แบบ Real-time ไปให้เครื่องเพื่อนเห็น
  socket.on('updateState', ({ roomCode, x, y, angle, score }) => {
    const targetCode = roomCode ? roomCode.toUpperCase() : '';
    const room = rooms.get(targetCode);
    if (!room) return;
    
    if (room.players[socket.id]) {
      room.players[socket.id].x = x;
      room.players[socket.id].y = y;
      room.players[socket.id].angle = angle;
      room.players[socket.id].score = score;

      // ส่งตำแหน่งพิกัดอัปเดตไปให้เพื่อนร่วมห้องเห็นทันที
      socket.to(targetCode).emit('peerUpdated', room.players[socket.id]);
    }
  });

  // 🗑️ 4. ตรวจจับตำแหน่งเมื่อมีใครกวาดขยะลงหลุมสำเร็จ จะลบวัตถุนั้นออกจากผู้เล่นทั้ง 2 คน
  socket.on('trashScored', ({ roomCode, trashId, binType }) => {
    const targetCode = roomCode ? roomCode.toUpperCase() : '';
    const room = rooms.get(targetCode);
    if (!room) return;
    
    room.trashItems = room.trashItems.filter((t: any) => t.id !== trashId);
    io.to(targetCode).emit('trashRemoved', { trashId, binType, scoredBy: socket.id });
  });

  // 🔌 5. ตัดการเชื่อมต่อเมื่อผู้เล่นกดปิดแท็บเว็บเกมหนีไป
  socket.on('disconnect', () => {
    rooms.forEach((room, roomCode) => {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomCode).emit('peerLeft', socket.id);
      }
    });
  });
});

// เปิดใช้พอร์ต 4000 สำหรับแชร์ข้อมูลแบบผู้เล่นหลายคน
const PORT = process.env.PORT || 4000; 

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${PORT}`);
});