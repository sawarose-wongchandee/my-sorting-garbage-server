import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
  private socket: any;
  private roomCode: string;
  private onStatsUpdate: Function;

  private myId!: string;
  private robot!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private otherRobots: Map<string, Phaser.GameObjects.Container> = new Map();
  
  // 🌟 รวมปุ่ม Space เข้าไปในกล่อง CursorKeys ของ Phaser โดยตรง
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys & { space?: Phaser.Input.Keyboard.Key };
  private trashGroup!: Phaser.Physics.Arcade.Group;
  private binsGroup!: Phaser.Physics.Arcade.StaticGroup;
  
  // รองรับการคีบขยะพร้อมกันสูงสุด 3 ชิ้น
  private holdingTrashList: Phaser.GameObjects.GameObject[] = [];
  private readonly MAX_HOLD_TRASH = 3;

  private localStats = { score: 0, collisions: 0, picks: 0, accuracy: 100 };
  private initialTrashData: any[] = [];
  private initialPlayersData: any[] = [];

  constructor(socket: any, roomCode: string, onStatsUpdate: Function) {
    super('MainScene');
    this.socket = socket;
    this.roomCode = roomCode;
    this.onStatsUpdate = onStatsUpdate;
  }

  preload() {
    // 🎨 สร้างพื้นผิววัตถุถังขยะ
    const createBinTexture = (key: string, color: number, radius: number) => {
      const gfx = this.make.graphics({ x: 0, y: 0, add: false });
      gfx.fillStyle(color, 1);
      gfx.fillCircle(radius, radius, radius);
      gfx.lineStyle(2, 0xffffff, 1);
      gfx.strokeCircle(radius, radius, radius);
      gfx.generateTexture(key, radius * 2, radius * 2);
    };

    createBinTexture('bin_plastic', 0x0000ff, 24);
    createBinTexture('bin_paper', 0x00ff00, 24);
    createBinTexture('bin_metal', 0xff0000, 24);

    // วาดขยะทรงขวด/แก้ว/กระป๋อง
    const plasticGfx = this.make.graphics({ x: 0, y: 0, add: false });
    plasticGfx.fillStyle(0x0000ff, 1); plasticGfx.fillRect(4, 8, 16, 20); plasticGfx.fillRect(8, 2, 8, 6);
    plasticGfx.fillStyle(0xffffff, 1); plasticGfx.fillRect(4, 14, 16, 6);
    plasticGfx.lineStyle(1, 0xffffff, 1); plasticGfx.strokeRect(4, 8, 16, 20);
    plasticGfx.generateTexture('trash_plastic', 24, 30);

    const paperGfx = this.make.graphics({ x: 0, y: 0, add: false });
    paperGfx.fillStyle(0x00ff00, 1); paperGfx.beginPath(); paperGfx.moveTo(2, 6); paperGfx.lineTo(22, 6); paperGfx.lineTo(18, 28); paperGfx.lineTo(6, 28); paperGfx.closePath(); paperGfx.fill();
    paperGfx.fillStyle(0xffffff, 1); paperGfx.fillRect(0, 2, 24, 4);
    paperGfx.generateTexture('trash_paper', 24, 30);

    const metalGfx = this.make.graphics({ x: 0, y: 0, add: false });
    metalGfx.fillStyle(0xff0000, 1); metalGfx.fillRect(3, 4, 18, 22); metalGfx.lineStyle(2, 0xcccccc, 1); metalGfx.strokeRect(3, 4, 18, 22);
    metalGfx.lineStyle(1, 0xffffff, 1); metalGfx.strokeLineShape(new Phaser.Geom.Line(3, 15, 21, 15));
    metalGfx.generateTexture('trash_metal', 24, 30);

    const wallGfx = this.make.graphics({ x: 0, y: 0, add: false });
    wallGfx.fillStyle(0x3e2723, 1); wallGfx.fillRect(0, 0, 32, 32); wallGfx.generateTexture('wall', 32, 32);

    const sorterGfx = this.make.graphics({ x: 0, y: 0, add: false });
    sorterGfx.fillStyle(0x424242, 1); sorterGfx.fillRect(0, 0, 80, 24); sorterGfx.generateTexture('sorter', 80, 24);
  }

  create(data: { trashItems: any[], currentPlayers?: any[], myId?: string }) {
    this.physics.world.drawDebug = false;
    
    this.initialTrashData = (data && data.trashItems && data.trashItems.length > 0) 
      ? data.trashItems 
      : this.generateLocalFallbackTrash();
      
    this.initialPlayersData = (data && data.currentPlayers) ? data.currentPlayers : [];
    this.myId = (data && data.myId) ? data.myId : 'local_player';

    // 1. กำแพง
    const walls = this.physics.add.staticGroup();
    for (let i = 0; i < 20; i++) {
      walls.create(i * 32 + 16, 16, 'wall'); walls.create(i * 32 + 16, 640 - 16, 'wall'); 
      walls.create(16, i * 32 + 16, 'wall'); walls.create(640 - 16, i * 32 + 16, 'wall'); 
    }

    // 2. หลุมแยกขยะ
    this.binsGroup = this.physics.add.staticGroup();
    this.binsGroup.create(90, 150, 'bin_plastic').setData('type', 'plastic').refreshBody();
    this.binsGroup.create(90, 320, 'bin_paper').setData('type', 'paper').refreshBody();
    this.binsGroup.create(90, 490, 'bin_metal').setData('type', 'metal').refreshBody();

    // 3. แท่นอุปสรรคตรงกลาง
    const centralSorters = this.physics.add.staticGroup();
    centralSorters.create(320, 160, 'sorter').refreshBody();
    centralSorters.create(320, 320, 'sorter').refreshBody();
    centralSorters.create(320, 480, 'sorter').refreshBody();

    // 4. บรรจุสิ่งของขยะลงสนาม
    this.trashGroup = this.physics.add.group({
      bounceX: 0.3,
      bounceY: 0.3,
      dragX: 200,
      dragY: 200
    });
    
    this.initialTrashData.forEach((t: any) => {
      if (t && t.x && t.y) {
        const item = this.trashGroup.create(t.x, t.y, `trash_${t.type}`);
        item.setCollideWorldBounds(true);
        item.setData('id', t.id);
        item.setData('type', t.type);
      }
    });

    // 5. ตั้งค่าหุ่นยนต์ปากกว้าง
    const myData = this.initialPlayersData.find(p => p.socketId === this.myId);
    const startX = myData ? myData.x : 540;
    const startY = myData ? myData.y : 500;
    const myColor = myData ? myData.color : 0xffa500;

    this.drawWideOpenClawRobotTexture('my_robot_texture', myColor);
    this.robot = this.physics.add.sprite(startX, startY, 'my_robot_texture');
    this.robot.setCollideWorldBounds(true);
    this.robot.body.setSize(64, 56);

    // ระบบดักคีบขยะเข้าก้ามปู
    this.physics.add.overlap(this.robot, this.trashGroup, (robotObj: any, trashObj: any) => {
      const isAlreadyHeld = this.holdingTrashList.includes(trashObj);
      if (!isAlreadyHeld && this.holdingTrashList.length < this.MAX_HOLD_TRASH) {
        this.holdingTrashList.push(trashObj);
        (trashObj.body as Phaser.Physics.Arcade.Body).setEnable(false); 
        this.localStats.picks++;
        this.onStatsUpdate({ ...this.localStats });
      }
    });

    this.physics.add.collider(this.trashGroup, walls);
    this.physics.add.collider(this.trashGroup, centralSorters);
    this.physics.add.collider(this.robot, walls, () => { this.localStats.collisions++; this.onStatsUpdate({ ...this.localStats }); });
    this.physics.add.collider(this.robot, centralSorters);

    this.initialPlayersData.forEach(p => { if (p.socketId !== this.myId) this.createPeerRobot(p); });
    if (this.socket && this.socket.connected) this.setupNetworkEvents();
    
    // 🌟 [จุดแก้หลัก] ลงทะเบียนรับแป้นคีย์บอร์ดรวมปุ่ม Spacebar แบบแกะกล่องชัวร์ 100%
    this.cursors = this.input.keyboard!.createCursorKeys();
  }

  update() {
    if (!this.robot || !this.robot.body) return;
    this.robot.setVelocity(0);

    const keyW = this.input.keyboard!.addKey('W');
    const keyS = this.input.keyboard!.addKey('S');
    const keyA = this.input.keyboard!.addKey('A');
    const keyD = this.input.keyboard!.addKey('D');

    let moved = false;

    if (this.cursors.left.isDown || keyA.isDown) { this.robot.setVelocityX(-180); this.robot.setAngle(180); moved = true; }
    else if (this.cursors.right.isDown || keyD.isDown) { this.robot.setVelocityX(180); this.robot.setAngle(0); moved = true; }
    
    if (this.cursors.up.isDown || keyW.isDown) { this.robot.setVelocityY(-180); this.robot.setAngle(-90); moved = true; }
    else if (this.cursors.down.isDown || keyS.isDown) { this.robot.setVelocityY(180); this.robot.setAngle(90); moved = true; }

    // 🌟 [ระบบแก้ปุ่มค้าง] เช็กผ่าน cursors.space.isDown โดยตรวจจับการกดแบบ JustDown ของ Phaser ป้องกันการกดเบิ้ลรัว
    if (Phaser.Input.Keyboard.JustDown(this.cursors.space!)) {
      this.releaseAllHeldTrash();
    }

    // จัดตำแหน่งขยะในปากก้ามปู
    const angleRad = Phaser.Math.DegToRad(this.robot.angle);
    const perpAngleRad = angleRad + Math.PI / 2;
    const offsets = [-14, 0, 14]; 

    this.holdingTrashList.forEach((trashObj: any, index) => {
      if (trashObj && trashObj.active) {
        const baseX = this.robot.x + Math.cos(angleRad) * 32;
        const baseY = this.robot.y + Math.sin(angleRad) * 32;

        const finalX = baseX + Math.cos(perpAngleRad) * offsets[index];
        const finalY = baseY + Math.sin(perpAngleRad) * offsets[index];

        trashObj.setPosition(finalX, finalY);
        trashObj.setAngle(this.robot.angle + 90);

        // เช็กระยะเข้าหลุม
        this.binsGroup.getChildren().forEach((binObj: any) => {
          const distance = Phaser.Math.Distance.Between(finalX, finalY, binObj.x, binObj.y);
          
          if (distance < 40) {
            const trashId = trashObj.getData('id');
            const trashType = trashObj.getData('type');
            const binType = binObj.getData('type');

            if (trashType === binType) {
              this.localStats.score += 100;
            } else {
              this.localStats.score = Math.max(0, this.localStats.score - 30);
            }
            
            this.onStatsUpdate({ ...this.localStats });
            
            if (this.socket && this.socket.connected) {
              this.socket.emit('trashScored', { roomCode: this.roomCode, trashId, binType });
            }
            
            trashObj.destroy();
            this.holdingTrashList = this.holdingTrashList.filter(t => t !== trashObj);
          }
        });
      }
    });

    if ((moved || this.robot.body.speed > 0) && this.socket && this.socket.connected) {
      const heldIds = this.holdingTrashList.map((t: any) => t.getData('id'));
      this.socket.emit('updateState', {
        roomCode: this.roomCode,
        x: this.robot.x,
        y: this.robot.y,
        angle: this.robot.angle,
        score: this.localStats.score,
        holdingTrashIds: heldIds
      });
    }
  }

  // 🌟 ฟังก์ชันคายขยะแบบเปิดฟิสิกส์ทันทีไม่มีหน่วง
  private releaseAllHeldTrash() {
    if (this.holdingTrashList.length === 0) return;

    const angleRad = Phaser.Math.DegToRad(this.robot.angle);

    this.holdingTrashList.forEach((trashObj: any) => {
      if (trashObj && trashObj.body) {
        const body = trashObj.body as Phaser.Physics.Arcade.Body;
        body.setEnable(true); // ปลุกฟิสิกส์ให้ตื่นขึ้นทันที
        
        // ดีดขยะออกไปข้างหน้าหุ่นยนต์ให้กระเด็นพ้นปากชัดเจน
        const pushX = Math.cos(angleRad) * 160;
        const pushY = Math.sin(angleRad) * 160;
        body.setVelocity(pushX, pushY);
        
        // บล็อกไม่ให้หุ่นยนต์ดูดกลับเข้าปากเป็นเวลา 0.6 วินาที
        body.checkCollision.none = true;
        this.time.delayedCall(600, () => {
          if (trashObj && trashObj.body) {
            (trashObj.body as Phaser.Physics.Arcade.Body).checkCollision.none = false;
          }
        });
      }
    });

    if (this.socket && this.socket.connected) {
      this.socket.emit('updateState', {
        roomCode: this.roomCode,
        x: this.robot.x,
        y: this.robot.y,
        angle: this.robot.angle,
        score: this.localStats.score,
        holdingTrashIds: []
      });
    }

    this.holdingTrashList = []; // เคลียร์ช่องเก็บขยะในปากให้ว่างโล่งทันที
  }

  private setupNetworkEvents() {
    this.socket.on('peerJoined', (p: any) => { this.createPeerRobot(p); });

    this.socket.on('peerUpdated', (p: any) => {
      const peerContainer = this.otherRobots.get(p.socketId);
      if (peerContainer) {
        peerContainer.setPosition(p.x, p.y);
        const sprite = peerContainer.first as Phaser.GameObjects.Sprite;
        if (sprite) sprite.setAngle(p.angle);
        
        if (p.holdingTrashIds && p.holdingTrashIds.length > 0) {
          const angleRad = Phaser.Math.DegToRad(p.angle);
          const perpAngleRad = angleRad + Math.PI / 2;
          const offsets = [-14, 0, 14];

          p.holdingTrashIds.forEach((id: string, index: number) => {
            this.trashGroup.getChildren().forEach((trashObj: any) => {
              if (trashObj.getData('id') === id) {
                const baseX = p.x + Math.cos(angleRad) * 32;
                const baseY = p.y + Math.sin(angleRad) * 32;
                trashObj.x = baseX + Math.cos(perpAngleRad) * offsets[index];
                trashObj.y = baseY + Math.sin(perpAngleRad) * offsets[index];
                trashObj.setAngle(p.angle + 90);
              }
            });
          });
        }
      }
    });

    this.socket.on('trashRemoved', ({ trashId }: { trashId: string }) => {
      this.holdingTrashList = this.holdingTrashList.filter((t: any) => t.getData('id') !== trashId);
      this.trashGroup.getChildren().forEach((trashObj: any) => {
        if (trashObj.getData('id') === trashId) trashObj.destroy();
      });
    });

    this.socket.on('peerLeft', (socketId: string) => {
      const peerContainer = this.otherRobots.get(socketId);
      if (peerContainer) { peerContainer.destroy(); this.otherRobots.delete(socketId); }
    });
  }

  private createPeerRobot(p: any) {
    const texKey = `robot_tex_${p.socketId}`;
    this.drawWideOpenClawRobotTexture(texKey, p.color);
    const sprite = this.add.sprite(0, 0, texKey);
    const text = this.add.text(-15, -36, p.teamName, { fontSize: '12px', color: '#fff' });
    const container = this.add.container(p.x, p.y, [sprite, text]);
    this.otherRobots.set(p.socketId, container);
  }

  private drawWideOpenClawRobotTexture(key: string, color: number) {
    if (this.textures.exists(key)) return;
    const gfx = this.make.graphics({ x: 0, y: 0, add: false });
    gfx.fillStyle(color, 1);
    gfx.fillRect(0, 8, 32, 40);
    gfx.fillRect(32, 8, 16, 8);
    gfx.fillRect(44, 16, 16, 8);
    gfx.fillRect(32, 40, 16, 8);
    gfx.fillRect(44, 32, 16, 8);
    gfx.lineStyle(2, 0xffffff, 1);
    gfx.strokeRect(0, 8, 32, 40);
    gfx.strokeRect(32, 8, 16, 8);
    gfx.strokeRect(44, 16, 16, 8);
    gfx.strokeRect(32, 40, 16, 8);
    gfx.strokeRect(44, 32, 16, 8);
    gfx.generateTexture(key, 60, 56);
  }

  private generateLocalFallbackTrash() {
    const types = ['plastic', 'paper', 'metal'];
    const items = [];
    for (let i = 0; i < 30; i++) {
      items.push({
        id: `local_${Math.random().toString(36).substring(2, 7)}`,
        type: types[i % types.length],
        x: Phaser.Math.Between(360, 580),
        y: Phaser.Math.Between(100, 540)
      });
    }
    return items;
  }
}