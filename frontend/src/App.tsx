import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import Phaser from 'phaser';
import { MainScene } from './game/MainScene';

// เชื่อมต่อไปยังเซิร์ฟเวอร์หลังบ้านพอร์ต 4000
const socket = io("https://my-sorting-garbage-server.onrender.com");

function App() {
  const [roomCode, setRoomCode] = useState('');
  const [teamName, setTeamName] = useState('');
  const [isJoined, setIsJoined] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [stats, setStats] = useState({ score: 0, collisions: 0, picks: 0, accuracy: 100 });
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    // ล้างแคชเกมเก่ากรณีที่มีการกดรีสตาร์ทหน้าจอ
    return () => {
      if (window.gameInstance) {
        window.gameInstance.destroy(true);
      }
    };
  }, []);

  // 🌟 ฟังก์ชันสําหรับคุณครู: กดเพื่อสร้างห้องแข่งขันใหม่
  const handleCreateRoom = () => {
    setErrorMessage('');
    socket.emit('createRoom', (response: any) => {
      if (response && response.success) {
        setRoomCode(response.roomCode);
        // เมื่อครูสร้างห้องสำเร็จ ให้ครูเข้าห้องอัตโนมัติในฐานะผู้เล่นคนแรก
        handleJoinRoom(response.roomCode, "คุณครู (Host)");
      } else {
        setErrorMessage('ไม่สามารถสร้างห้องแข่งขันได้ กรุณาเช็กเซิร์ฟเวอร์หลังบ้าน');
      }
    });
  };

  // 🎮 ฟังก์ชันสำหรับเด็กนักเรียน (หรือครู): กดเข้าร่วมห้องแข่งขัน
  const handleJoinRoom = (targetRoomCode: string, targetTeamName: string) => {
    const code = targetRoomCode || roomCode;
    const name = targetTeamName || teamName;

    if (!code) {
      setErrorMessage('กรุณากรอกรหัสโค้ดห้องแข่งขันก่อนค่ะ');
      return;
    }

    setErrorMessage('');
    socket.emit('joinRoom', { roomCode: code.toUpperCase(), teamName: name }, (response: any) => {
      if (response && response.success) {
        setIsJoined(true);
        setRoomCode(code.toUpperCase());
        
        // 🚀 บูตระบบเกม Phaser ขึ้นมาทันทีเมื่อเซิร์ฟเวอร์ตอบรับสำเร็จ
        setTimeout(() => {
          const config: Phaser.Types.Core.GameConfig = {
            type: Phaser.AUTO,
            width: 640,
            height: 640,
            parent: 'game-container',
            physics: {
              default: 'arcade',
              arcade: { gravity: { y: 0 }, debug: false }
            },
            scene: new MainScene(socket, code.toUpperCase(), (updatedStats: any) => {
              setStats(updatedStats);
            })
          };

          // สั่งรันตัวเกมและบันทึกไว้ในหน้าต่าง Window เพื่อป้องกันตัวเกมซ้อนกัน
          if (window.gameInstance) window.gameInstance.destroy(true);
          window.gameInstance = new Phaser.Game(config, response);
          setGameStarted(true);
        }, 100);
      } else {
        setErrorMessage('ไม่พบรหัสห้องนี้ หรือห้องแข่งขันอาจจะเต็มแล้วค่ะ');
      }
    });
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      <h2>🤖 ระบบฝึกซ้อมหุ่นยนต์กวาดแยกขยะ (Multiplayer 2 คน) 🤖</h2>
      
      {errorMessage && <p style={{ color: 'red', fontWeight: 'bold' }}>{errorMessage}</p>}

      {!isJoined ? (
        // --- หน้าแรก: เมนูก่อนเข้าห้องแข่งขัน ---
        <div style={{ border: '2px dashed #ccc', padding: '30px', borderRadius: '10px', backgroundColor: '#f9f9f9' }}>
          <div style={{ marginBottom: '20px' }}>
            <h3>สำหรับคุณครู 👨‍🏫</h3>
            <button 
              onClick={handleCreateRoom}
              style={{ padding: '12px 24px', fontSize: '16px', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
            >
              ➕ กดสร้างห้องแข่งขันใหม่ (Create Room)
            </button>
          </div>

          <hr style={{ margin: '25px 0', borderColor: '#eee' }} />

          <div>
            <h3>สำหรับนักเรียน (ผู้เข้าแข่งขัน คนที่ 1 และ 2) 🧑‍🎓</h3>
            <input 
              type="text" 
              placeholder="กรอกชื่อทีม/ชื่อผู้เล่น" 
              value={teamName} 
              onChange={(e) => setTeamName(e.target.value)}
              style={{ padding: '10px', marginRight: '10px', fontSize: '15px', width: '200px' }}
            />
            <input 
              type="text" 
              placeholder="รหัสห้อง (4 หลัก)" 
              value={roomCode} 
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              style={{ padding: '10px', marginRight: '10px', fontSize: '15px', width: '120px', textAlign: 'center', fontWeight: 'bold' }}
            />
            <button 
              onClick={() => handleJoinRoom('', '')}
              style={{ padding: '10px 20px', fontSize: '15px', backgroundColor: '#2196F3', color: 'white', border: 'none', borderRadius: '5px', cursor: 'pointer' }}
            >
              🚪 เข้าร่วมห้องเกม
            </button>
          </div>
        </div>
      ) : (
        // --- หน้าที่สอง: หน้าต่างแดชบอร์ดสรุปคะแนนสดขณะกำลังเล่นเกม ---
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-around', background: '#333', color: '#fff', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
            <div>ห้องแข่งขัน: <strong style={{ color: '#ffeb3b', fontSize: '18px' }}>{roomCode}</strong></div>
            <div>คะแนนทีมคุณ: <strong style={{ color: '#4caf50' }}>{stats.score} แต้ม</strong></div>
            <div>ชนกำแพง: <strong style={{ color: '#f44336' }}>{stats.collisions} ครั้ง</strong></div>
          </div>

          {/* กล่องเวทีเกมสําหรับแสดงผลแม็พ Phaser */}
          <div id="game-container" style={{ display: 'inline-block', border: '4px solid #333', borderRadius: '8px', overflow: 'hidden', backgroundColor: '#000' }}></div>
          
          <p style={{ color: '#666', fontSize: '14px', marginTop: '10px' }}>
            💡 ใช้ปุ่ม <strong>W, A, S, D</strong> หรือ <strong>ปุ่มลูกศร</strong> บนคีย์บอร์ด หรือโยก <strong>จอยสติ๊ก</strong> เพื่อขับหุ่นกวาดสิ่งของลงหลุมได้เลย!
          </p>
        </div>
      )}
    </div>
  );
}

export default App;

// ประกาศ Type ป้องกันระบบตรวจจับโค้ดพังบนหน้าเว็บ
declare global {
  interface Window {
    gameInstance: any;
  }
}