import {gameDimensions} from "./gameSettings";
//let gameDimensions = {width: 1200, height: 600};

const getStartingPrisons = () => {
    let objs = [];
    for(let i = 0; i < 4; i++){
        for(let j = 0; j < 5; j++) {
            objs.push({
                texture: "block1",
                killable: true,
                position: {
                    x: ( 160 - (j>2 ? 64*(j-2) : 0) ) * (1-i%2)   +   (gameDimensions.width-160 + (j>2 ? 64*(j-2) : 0) ) * (i%2),
                    y: i<2 ? ( 32 + Math.min(j*64, 128) ) :  (gameDimensions.height-32 - Math.min(j*64, 128))
                }
            });
        }
    }
    return objs;
}

const getCenteredSquare = (side) => {
    let objs = [];
    const startX = 32+(gameDimensions.width/2-side/2*64);
    const startY = 32+(gameDimensions.height/2-side/2*64);
    for(let line = 0; line < side; line++){
        for(let col = 0; col < side; col++){
            if(line===0 || line === side-1){
                objs.push({
                   texture: "block1",
                   killable: true,
                   position: {
                       x: startX+64*col,
                       y: startY+64*line
                   }
                });
            } else {
                if(col===0 || col===side-1){
                    objs.push({
                        texture: "block1",
                        killable: true,
                        position: {
                            x: startX+64*col,
                            y: startY+64*line
                        }
                    });
                }
            }
        }
    }
    return objs;
}

const getNotKillableSlalom = (number, coverRatio) => {
    let objs = [];
    const gap = (gameDimensions.width-64*number) / (number+1);
    const height = gameDimensions.height*coverRatio;
    const scaleY = height/64;
    for(let i = 0; i < number; i++){
        objs.push({
            texture: "block2",
            killable: false,
            position: {
                x: gap*i+32,
                y: i%2 * (height/2) + (1-i%2) * (gameDimensions-height/2)
            },
            scale: {
                x: 1,
                y: scaleY
            }
        });
    }
    return objs;
}

export { getStartingPrisons, getCenteredSquare, getNotKillableSlalom };