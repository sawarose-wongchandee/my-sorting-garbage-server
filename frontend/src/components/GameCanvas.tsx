import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import { MainScene } from '../game/MainScene';

export const GameCanvas: React.FC<{ socket: any; roomCode: string; trashItems: any[] }> = ({ socket, roomCode, trashItems }) => {
  const gameRef = useRef<Phaser.Game | null>(null);
  const [uiStats, setUiStats] = useState({ score: 0, collisions: 0, accuracy: 100 });

  useEffect(() => {
    if (!gameRef.current) {
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 640,
        height: 640,
        parent: 'game-root',
        physics: { default: 'arcade', arcade: { debug: false } },
        scene: [new MainScene(socket, roomCode, (s: any) => setUiStats(s))]
      };
      gameRef.current = new Phaser.Game(config);
      gameRef.current.scene.start('MainScene', { trashItems });
    }
    return () => { gameRef.current?.destroy(true); gameRef.current = null; };
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', backgroundColor: '#111827', padding: '20px', color: 'white' }}>
      <h2>ห้องซ้อมของคุณ: <span style={{ color: '#FBBF24' }}>{roomCode}</span></h2>
      <div id="game-root" style={{ border: '4px solid #F59E0B', borderRadius: '4px' }} />
      <div style={{ display: 'flex', justifyContent: 'space-around', width: '640px', marginTop: '15px', background: '#1F2937', padding: '10px', fontFamily: 'monospace' }}>
        <div>คะแนน: <span style={{ color: '#34D399' }}>{uiStats.score}</span></div>
        <div>ชนกำแพง: <span style={{ color: '#F87171' }}>{uiStats.collisions}</span></div>
        <div>ความแม่นยำ: <span style={{ color: '#FBBF24' }}>{uiStats.accuracy.toFixed(1)}%</span></div>
      </div>
    </div>
  );
};