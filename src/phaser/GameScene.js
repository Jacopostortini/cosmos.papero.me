import * as Phaser from "phaser";
import websocketEvents from "../constants/websocketEvents";
import {gameDimensions, arcadeNormalizers, powerUps, sceneKeys, matterNormalizers} from "../constants/gameSettings";
import {detectTouchScreen, removeFromArray} from "../constants/constants";
import _ from "lodash";
import createMap from "../phaser/maps";

import {
    createBulletsLoadedObject,
    getBodyFromCollision,
    loadImages,
    setInputHandlers,
    velocityFromAngle
} from "./scene";


export default class GameScene extends Phaser.Scene {

    setUpGame(game){
        this.status = game.status;
        this.timer = game.timer;
        this.settings = game.settings;
        this.currentPlayer = game.currentPlayer;
        this.admin = game.admin;
        this.map = game.map;
        this.settings.maxVelocityLittle = game.settings.velocity+0.2;
        this.settings.accelerationLittle = 0.1;
        this.settings.respawnTime = 8000;
        this.settings.frictionAir = 0.005;
        this.settings.powerUpVelocity = 3;
        this.settings.powerUpAngularVelocity = 0.1;
        this.players = {};
        game.players.forEach(player => {
            this.players[player.localId] = _.cloneDeep(player);
            this.players[player.localId].availableBullets = this.maxBullets;
            this.players[player.localId].lastTimestamp = 0;
        });
        this.powerUpsObjects = [];
    }

    constructor(socket, game) {
        super({
            key: sceneKeys.game,
            physics: {
                default: "matter",
                matter: {
                    debug: false,
                    setBounds: true
                }
            }
        });

        this.socket = socket;

        this.updateFps = 10;
        this.touchScreen = detectTouchScreen();
        this.defaultImageOptions = {friction: 0, frictionAir: 0, frictionStatic: 0, ignoreGravity: true};
        this.maxBullets = 3;
        this.powerUpIds = 0;
        this.powerUpGenerationTime = 10000;

        this.setUpGame(game);

        this.socket.on(websocketEvents.UPDATE_SHIP, data => this.updateShip(data));
        this.socket.on(websocketEvents.SHOOT, data => this.createBullet(data));
        this.socket.on(websocketEvents.CHANGE_STATE, data => this.updateState(data));
        this.socket.on(websocketEvents.RELOAD, data => this.reload(data));
        this.socket.on(websocketEvents.POWER_UP, data => this.powerUpEvent(data));
        this.socket.on(websocketEvents.END_TURN, data => {
            setTimeout(()=>{
                this.clearIntervals(true);
                this.scene.start(sceneKeys.ranking, _.cloneDeep(data));
            }, 2000);
        });

        this.setVisibilityChangeEvent();
    }

    init(game){
        console.log("Game scene init", _.cloneDeep(game));
        if(Object.entries(game).length>0) this.setUpGame(game);
    }

    preload(){
        console.log("Game scene preload")
        loadImages(this, sceneKeys.game);
    }

    create(){
        console.log("Game scene create")
        if(this.status-Math.floor(this.status)===0.5) {
            setTimeout(()=>{
                if(this.timer > Date.now()){
                    this.scene.stop();
                    this.scene.start(sceneKeys.ranking, _.cloneDeep({
                        players: _.cloneDeep(Object.values(this.players)),
                        timer: this.timer
                    }));
                }
            }, 100);
            return;
        }
        console.log("continuing create");
        Phaser.Physics.Matter.Image.prototype.shapedSetOnCollide = function (callback) {
            if (this.body && this.body.parts && this.body.parts.length) {
                for (let part of this.body.parts) {
                    part.onCollideCallback = callback;
                }
            }
            return this.setOnCollide(callback);
        }

        this.jsonShapes = this.cache.json.get("shapes");

        this.createCategories();
        this.createShips();
        createMap(this);

        setInputHandlers(this, sceneKeys.game);

        this.setReloadInterval();
        this.setUpdateShipInterval();
        if(this.admin === this.currentPlayer){
            this.setPowerUpInterval();
            this.generatePowerUp({x: gameDimensions.width/2, y: gameDimensions.height/2}, 2);
        }

        this.setOnDestroy();
    }

    update(time, delta){
        if(this.currentPlayer !== null && this.players[this.currentPlayer].ship && this.players[this.currentPlayer].ship.body) {
            if (this.rotationKey.isDown || this.rotating) this.rotate(delta);
            if (this.accelerateLittleKey.isDown || this.accelerating) this.moveLittle(delta);

            this.setCurrentPlayerNewVelocity();
            if (this.players[this.currentPlayer].state === 1) this.decelerateLittle(delta);
        }

        Object.values(this.players).forEach(player => {
            if(!player.ship || !player.ship.body) return;
            const topLeft = player.ship.getTopLeft();
            const bottomLeft = player.ship.getBottomLeft();
            const centerLeft = {
                x: (topLeft.x + bottomLeft.x) / 2,
                y: (topLeft.y + bottomLeft.y) / 2
            }
            player.bulletsLoaded.gameObjects.forEach((bullet, index)=>{
                const {x, y} = this.getLoadedBulletPosition(index, topLeft, bottomLeft, centerLeft, player);
                bullet.x = x;
                bullet.y = y;
            });
            if(player.localId!==this.currentPlayer){
                player.ship.autonomyTime -= delta;
                if(player.ship.autonomyTime<0) {
                    player.ship.setVelocity(0);
                    player.ship.setAngularVelocity(0);
                }
            }
        });
    }




    //=============================================================================
    //Creating things
    createCategories(){
        this.shipsCategory = 2;
        this.bulletsCategory = 4;
        this.powerUpsCategory = 8;
        this.mapObjectCategory = 16;
        this.laserCategory = 32;
    }

    createShips(){
        const order = [0, 3, 2, 1];
        let index = 0;
        const textures = ["", "little", "ship", "shielded"];
        Object.values(this.players).forEach(player => {
            if(player.state === 0) return;

            player.ship = this.matter.add.image(
                (order[index]<2 ? 30 : gameDimensions.width-30),
                ( order[index]%2 === 0 ? 30 : gameDimensions.height-30 ),
                textures[player.state]+player.color,
                null,
                {
                    ...this.defaultImageOptions,
                    shape: this.jsonShapes.ship
                }
            );
            player.ship.setCollisionCategory(this.shipsCategory);
            player.ship.setAngle(-45  * ( order[index] < 2 ? 1 : 3) * ( ( order[index] % 2 ) * 2 - 1 ));
            player.ship.velocityMagnitude = this.settings.velocity*matterNormalizers.velocity;
            player.ship.localId = player.localId;
            player.ship.autonomyTime = 0;
            this.matter.body.setInertia(player.ship.body, Infinity);

            player.bulletsLoaded = createBulletsLoadedObject(this);

            if(player.localId===this.currentPlayer){
                player.ship.shapedSetOnCollide((collision) => {
                   this.onCurrentShipCollision(collision);
                });
            }
            index++;
        });
    }

    createBullet(data){
        const {x, y} = velocityFromAngle(data.angle, this.settings.bulletVelocity*matterNormalizers.bulletVelocity);
        const bullet = this.matter.add.image(
            data.position.x,
            data.position.y,
            "bullet",
            null,
            this.defaultImageOptions
        );
        bullet.setCollisionCategory(this.bulletsCategory);
        bullet.setCollidesWith([1, this.shipsCategory, this.mapObjectCategory]);
        bullet.setOnCollide(()=>{
            bullet.destroy();
        });
        bullet.setAngle(data.angle);
        bullet.setVelocity(x, y);
        bullet.shotBy = data.localId;
        this.players[data.localId].availableBullets--;
        this.players[data.localId].bulletsLoaded.killFirstAlive();
        this.matter.body.setInertia(bullet.body, Infinity);
    }

    createPowerUp(data){
        const newPowerUp = this.matter.add.image(data.position.x, data.position.y, data.powerUp, null,
            {
                ...this.defaultImageOptions,
                shape: this.jsonShapes[data.powerUp]
            });
        const {x, y} = velocityFromAngle(data.angle, this.settings.powerUpVelocity);
        newPowerUp.setVelocity(x, y);
        newPowerUp.setAngularVelocity(this.settings.powerUpAngularVelocity);
        newPowerUp.powerUp = data.powerUp;
        newPowerUp.setCollisionCategory(this.powerUpsCategory);
        newPowerUp.setCollidesWith([1, this.shipsCategory, this.mapObjectCategory]);
        newPowerUp.id = data.id;
        this.matter.body.setInertia(newPowerUp.body, Infinity);
        this.powerUpsObjects.push(newPowerUp);
    }

    createLaser(data){
        const maxLength = Phaser.Math.Distance.Between(0, 0, gameDimensions.width, gameDimensions.height);
        const laser = this.matter.add.image(data.position.x, data.position.y, "bullet", null, this.defaultImageOptions);
        laser.shotBy = data.localId;
        laser.setScale(maxLength/laser.width, 1);
        laser.setSensor(true);
        laser.setAngle(data.angle);
        laser.setPosition(laser.x+maxLength/2*Math.cos(data.angle*Math.PI/180), laser.y+maxLength/2*Math.sin(data.angle*Math.PI/180));
        laser.setCollidesWith([this.shipsCategory, this.mapObjectCategory]);
        laser.setCollisionCategory(this.laserCategory);
        this.matter.body.setMass(laser.body, Infinity);
        this.players[data.localId].ship.setToSleep();
        setTimeout(()=>{
            laser.destroy();
            this.players[data.localId].ship.setAwake();
        }, 500);
    }

    generatePowerUp({x, y}, n=1){
        for(let i = 0; i < n; i++){
            const data = {
                type: "create",
                powerUp: powerUps[Math.floor(Math.random()*powerUps.length)],
                position: {
                    x: x || Phaser.Math.FloatBetween(0, gameDimensions.width),
                    y: y || Phaser.Math.FloatBetween(0, gameDimensions.height)
                },
                angle: Phaser.Math.FloatBetween(0, 360),
                id: ++this.powerUpIds
            }
            this.socket.emit(websocketEvents.POWER_UP, data);
            this.powerUpEvent(data);
        }
    }




    //=============================================================================
    //Others do things via the websocket
    updateShip(data){
        const player = this.players[data[0]];
        if(!player.ship) return;
        const deltaMilliseconds = (data[3]-player.lastTimestamp);
        const deltaUnits = deltaMilliseconds*60/1000;
        if(deltaMilliseconds<=0) return;

        let deltaTheta = data[1] - Math.floor(player.ship.angle);

        if(deltaTheta*Math.sign(this.settings.angularVelocity) < -10) deltaTheta += 360*Math.sign(this.settings.angularVelocity);
        else if(deltaTheta*Math.sign(this.settings.angularVelocity) < 0) deltaTheta = 0;
        const angularVelocity = deltaTheta / deltaUnits;
        player.ship.setAngularVelocity(angularVelocity * Math.PI / 180);
        player.ship.setVelocity( ( data[2][0]-player.ship.x ) / deltaUnits, ( data[2][1]-player.ship.y ) / deltaUnits );

        player.lastTimestamp = data[3];
        player.ship.autonomyTime = deltaMilliseconds;
    }

    powerUpEvent(data){
        //Create power up item
        if(data.type === "create") this.createPowerUp(data);
        //Player gets power up
        else if(data.type === "get") {
            for(let i=0; i<this.powerUpsObjects.length; i++){
                const child = this.powerUpsObjects[i];
                if(child.id === data.id){
                    this.powerUpsObjects = removeFromArray(this.powerUpsObjects, i);
                    child.destroy();
                    break;
                }
            }
            let dataToSend;
            switch (data.powerUp){
                case "reverse":
                    this.settings.angularVelocity *= -1;
                    break;
                case "shield":
                    dataToSend = {
                        localId: data.localId,
                        state: 3
                    }
                    this.socket.emit(websocketEvents.CHANGE_STATE, dataToSend);
                    this.updateState(dataToSend);
                    break;
                case "reload":
                    dataToSend = {
                        localId: data.localId,
                        availableBullets: this.maxBullets
                    };
                    this.socket.emit(websocketEvents.RELOAD, dataToSend);
                    this.reload(dataToSend);
                    break;
                case "laser":
                    this.players[data.localId].ship.hasLaser = true;
            }
        }
        //Player uses power up
        else if(data.type === "use") {
            if (data.powerUp === "laser") this.createLaser(data);
        }
    }



    //=============================================================================
    //Current players does things
    rotate(delta){
        this.players[this.currentPlayer].ship.setAngle(
            this.players[this.currentPlayer].ship.angle + delta * this.settings.angularVelocity * matterNormalizers.angularVelocity
        );
    }

    moveLittle(delta){
        const currentPlayer = this.players[this.currentPlayer];
        if(currentPlayer.state === 1){
            const ship = currentPlayer.ship;
            const previousMag = ship.velocityMagnitude;
            if(previousMag < this.settings.maxVelocityLittle * matterNormalizers.velocity){
                currentPlayer.ship.velocityMagnitude += delta*this.settings.accelerationLittle;
            } else {
                currentPlayer.ship.velocityMagnitude = this.settings.maxVelocityLittle * matterNormalizers.velocity;
            }
        }
    }

    shoot(){
        const currentPlayer = this.players[this.currentPlayer];
        const ship = currentPlayer.ship;
        const angle = ship.angle;
        const data = {
            position: {
                x: ship.x + ship.width*5/4*Math.cos(angle * Math.PI / 180),
                y: ship.y + ship.height*5/4*Math.sin(angle * Math.PI / 180)
            },
            angle: angle,
            localId: this.currentPlayer
        };
        if(currentPlayer.ship.hasLaser){
            data.type = "use";
            data.powerUp = "laser";
            this.socket.emit(websocketEvents.POWER_UP, data);
            this.createLaser(data);
            currentPlayer.ship.hasLaser = false;
        } else {
            if(currentPlayer.availableBullets>0){
                this.socket.emit(websocketEvents.SHOOT, data);
                this.createBullet(data);
            }
        }
    }


    updateState(data){
        this.players[data.localId].state = data.state;
        const player = this.players[data.localId];
        switch (data.state) {
            case 0:
                player.ship.destroy();
                this.players[data.localId].bulletsLoaded.killAll();
                break;
            case 1:
                player.ship.setTexture("little" + this.players[data.localId].color);
                this.players[data.localId].bulletsLoaded.killAll();
                if(data.localId === this.currentPlayer) {
                    setTimeout(() => {
                        if (this.players[data.localId].state === 1) {
                            const data = {
                                localId: this.currentPlayer,
                                state: 2
                            };
                            this.updateState(data);
                            this.socket.emit(websocketEvents.CHANGE_STATE, data);
                        }
                    }, this.settings.respawnTime);
                }
                break;
            case 2:
                player.ship.velocityMagnitude = this.settings.velocity * matterNormalizers.velocity;
                player.ship.setTexture("ship" + this.players[data.localId].color);
                player.bulletsLoaded.enableAll();
                break;
            case 3:
                player.ship.velocityMagnitude = this.settings.velocity * matterNormalizers.velocity;
                player.ship.setTexture("shielded" + this.players[data.localId].color);
                break;
        }
    }

    onCurrentShipCollision(collision) {
        const player = this.players[this.currentPlayer];
        const body = getBodyFromCollision(player.ship.body.id, collision);
        if(body.parent.collisionFilter.category === this.bulletsCategory){
            //collision with a bullet
            this.onBulletCollision(player.ship, body.gameObject);
        } else if(body.parent.collisionFilter.category === this.powerUpsCategory){
            //Collision with power up
            this.onPowerUpCollision(player.ship, body.gameObject);
        } else if(body.parent.collisionFilter.category === this.shipsCategory){
            //Collision with ship
            if(this.players[this.currentPlayer].state === 1 && this.players[body.gameObject.localId].state >= 2){
                const data = {
                    localId: this.currentPlayer,
                    state: 0,
                    killedBy: body.gameObject.localId
                };
                this.socket.emit(websocketEvents.CHANGE_STATE, data);
                this.updateState(data);
            }
        } else if(body.parent.collisionFilter.category === this.laserCategory){
            //Collision with laser
            const state = this.players[this.currentPlayer].state-2;
            const data = {
                localId: this.currentPlayer,
                state
            };
            if(state===0) data.killedBy= body.parent.gameObject.shotBy;
            this.clearIntervals(false);
            this.socket.emit(websocketEvents.CHANGE_STATE, data);
            this.updateState(data);
        }
    }

    onBulletCollision(ship, bullet){
        const state = this.players[ship.localId].state-1;
        const data = {
            localId: ship.localId,
            state
        };
        if(state === 0) {
            data.killedBy = bullet.shotBy;
            this.clearIntervals(false);
        }
        this.socket.emit(websocketEvents.CHANGE_STATE, data);
        this.updateState(data);
    }

    onPowerUpCollision(ship, powerUp){
        if(this.players[ship.localId].state < 2 ) return;
        const data = {
            type: "get",
            localId: ship.localId,
            powerUp: powerUp.powerUp,
            id: powerUp.id
        }
        this.socket.emit(websocketEvents.POWER_UP, data);
        this.powerUpEvent(data);
    }

    reload(data){
        this.players[data.localId].availableBullets = data.availableBullets;
        this.players[data.localId].bulletsLoaded.enableTo(data.availableBullets);
    }


    //=============================================================================
    //Game loop functions
    setCurrentPlayerNewVelocity(){
        const {x, y} = velocityFromAngle(
            this.players[this.currentPlayer].ship.angle,
            this.players[this.currentPlayer].ship.velocityMagnitude
        );
        this.players[this.currentPlayer].ship.setVelocity(x, y);
    }

    decelerateLittle(delta){
        this.players[this.currentPlayer].ship.velocityMagnitude = Math.max(
            0, this.players[this.currentPlayer].ship.velocityMagnitude - this.settings.frictionAir * delta
        );
    }

    getLoadedBulletPosition(index, topLeft, bottomLeft, centerLeft, player){
        switch (index){
            case 0:
                return {
                    x: bottomLeft.x - (player.ship.width/4)*Math.cos(player.ship.rotation),
                    y: bottomLeft.y - (player.ship.height/4)*Math.sin(player.ship.rotation)
                };
            case 1:
                return{
                    x: topLeft.x - (player.ship.width/4)*Math.cos(player.ship.rotation),
                    y: topLeft.y - (player.ship.height/4)*Math.sin(player.ship.rotation)
                };
            case 2:
                return {
                    x: centerLeft.x - (player.ship.width/4)*Math.cos(player.ship.rotation),
                    y: centerLeft.y - (player.ship.height/4)*Math.sin(player.ship.rotation)
                };
        }
    }



    //=============================================================================
    //On create setup
    setUpdateShipInterval(){
        if(this.currentPlayer === null) return;

        const currentPlayer = this.players[this.currentPlayer];
        this.updateShipInterval = setInterval(()=>{
            if(!currentPlayer.ship || !currentPlayer.ship.body) return;
            this.socket.emit(websocketEvents.UPDATE_SHIP, [
                this.currentPlayer,
                Math.floor(currentPlayer.ship.angle),
                [
                    Number.parseFloat(currentPlayer.ship.x.toFixed(2)),
                    Number.parseFloat(currentPlayer.ship.y.toFixed(2))
                ],
                this.time.now
            ]);
        }, 1000/this.updateFps);
    }

    setReloadInterval(){
        if(this.currentPlayer === null) return;

        this.reloadInterval = setInterval(() => {
            if(this.players[this.currentPlayer].state<2) return;
            const availableBullets = Math.min(this.maxBullets, this.players[this.currentPlayer].availableBullets + 1);
            const data = {
                localId: this.currentPlayer,
                availableBullets
            };
            this.socket.emit(websocketEvents.RELOAD, data);
            this.reload(data);
        }, 1/(this.settings.reloadingVelocity * arcadeNormalizers.reloadingVelocity));
    }

    setPowerUpInterval(){
        this.powerUpInterval = setInterval(()=>{
            this.generatePowerUp({}, 2);
        }, this.powerUpGenerationTime);
    }

    setOnDestroy(){
        if(this.currentPlayer === null) return;

        this.events.on("destroy", ()=>{
            this.clearIntervals(true);
        });
    }

    clearIntervals(powerUp){
        clearInterval(this.updateShipInterval);
        clearInterval(this.reloadInterval);
        if(powerUp && this.currentPlayer===this.admin) clearInterval(this.powerUpInterval);
    }

    setVisibilityChangeEvent() {
        window.addEventListener("visibilitychange", () => {
            if(this.status-Math.floor(this.status)===0){
                if(document.visibilityState === "hidden"){
                    this.socket.close();
                } else {
                    this.socket.open();
                }
            }
        });
    }
}