import React, { useEffect, useState } from 'react';

export const Dashboard: React.FC<{ socket: any; roomCode: string }> = ({ socket, roomCode }) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [timer, setTimer] = useState(180);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    socket.on('playerJoined', (list: any[]) => setPlayers(list));
    socket.on('playerLeft', (list: any[]) => setPlayers(list));
    socket.on('playerUpdated', (player: any) => {
      setPlayers(prev => prev.map(p => p.socketId === player.socketId ? player : p));
    });
    socket.on('timeUpdate', ({ timer }: any) => setTimer(timer));
    socket.on('gameStarted', () => setStarted(true));
    socket.on('gameFinished', ({ players: finalData }: any) => {
      setStarted(false);
      setPlayers(finalData);
      alert('จบการแข่งขัน!');
    });
    return () => {
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('playerUpdated');
      socket.off('timeUpdate');
    };
  }, [socket]);

  return (
    <div style={{ padding: '20px', backgroundColor: '#030712', minHeight: '100vh', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', backgroundColor: '#111827', padding: '15px', borderRadius: '5px', marginBottom: '20px' }}>
        <div>
          <h2>ห้องควบคุมของคุณครู: <span style={{ color: '#FBBF24' }}>{roomCode}</span></h2>
          <h3>เวลาแข่งขันสด: <span style={{ color: '#22D3EE' }}>{timer} วินาที</span></h3>
        </div>
        {!started && (
          <button onClick={() => socket.emit('startGame', { roomCode })} style={{ backgroundColor: '#10B981', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>
            เริ่มการแข่งขันพร้อมกัน
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
        {players.map((p) => (
          <div key={p.socketId} style={{ backgroundColor: '#1F2937', padding: '15px', borderRadius: '5px', border: '1px solid #374151' }}>
            <h3 style={{ color: '#FCD34D', margin: '0 0 10px 0' }}>{p.teamName}</h3>
            <p>คะแนนสด: <span style={{ color: '#34D399', fontWeight: 'bold' }}>{p.stats.score}</span></p>
            <p>พิกัดหุ่น: ({Math.floor(p.position.x)}, {Math.floor(p.position.y)})</p>
            <p>ชนกำแพง: {p.stats.collisions} ครั้ง</p>
            <p>สถานะของที่ถือ: {p.holdingTrash ? `ถือขยะ (${p.holdingTrash.type})` : 'มือว่าง'}</p>
          </div>
        ))}
      </div>
    </div>
  );
};