<template>
  <div class="lobby">
    <h1>{{gameId}}</h1>

    <GameSettings  v-if="game.currentPlayer!==null"
                   :game="game"
                   :socket="socket"/>

    <button class="join-button" v-else @click="joinGame">{{strings.gameView.lobby.joinLobby}}</button>

    <div id="players-wrapper">
      <div>
        <img src="../../assets/space-key-icon.png"/>
        <img src="../../assets/enter-key-icon.png"/>
      </div>
    </div>

    <div class="infos">
      <ChangeColor v-if="game.currentPlayer!==null" :socket="socket" :players="game.players"/>
      <CopyInformation :msg="strings.gameView.lobby.shareTheLink" :info="link"/>
      <CopyInformation :msg="strings.gameView.lobby.copyTag" :info="gameId"/>
    </div>
  </div>
</template>

<script>
import * as Phaser from "phaser";
import {config, strings} from "../../constants/constants";
import LobbyScene from "../../phaser/LobbyScene";
import ChangeColor from "./lobbyComponents/ChangeColor";
import CopyInformation from "./lobbyComponents/CopyInformation";
import websocketEvents from "../../constants/websocketEvents";
import GameSettings from "./lobbyComponents/GameSettings";
import {defaultSettings} from "../../constants/gameSettings";
export default {
  name: "Lobby",
  components: {GameSettings, CopyInformation, ChangeColor},
  props: {
    socket: Object
  },
  data(){
    return {
      strings,
      websocketEvents,
      game: {
        settings: defaultSettings
      },
      phaserScene: null
    }
  },
  mounted() {
    const parent = document.getElementById("players-wrapper");
    const height = Math.min(parent.offsetWidth, parent.offsetHeight);
    const width = window.innerWidth>751 ? height : window.innerWidth*0.8;
    this.phaserScene = new Phaser.Game(
        config(
            new LobbyScene(this.socket),
            parent,
            width,
            height
        ));
    this.socket.on(websocketEvents.LOBBY_MODIFIED, (game)=>{
      this.game = {...game};
    });
  },
  computed: {
    gameId: function () {
      return this.$route.params.gameId;
    },
    isAdmin: function (){
      return this.game.admin === this.game.currentPlayer;
    },
    link: function(){
      return window.location.href;
    }
  },
  methods: {
    joinGame(){
      this.socket.emit(websocketEvents.JOIN_GAME);
    }
  },
  unmounted() {
    this.phaserScene.destroy(true);
  }

}
</script>

<style lang="scss" scoped>

.lobby{
  width: 100%;
  height: 100%;
  display: grid;
  justify-items: center;
  @media (min-width: 751px) {
    grid-template-rows: 20% 80%;
    grid-template-columns: 30% 40% 30%;
    grid-template-areas: "title title title" "settings phaser infos";
  }
  @media (max-width: 751px) {
    grid-template-rows: auto 300px auto auto;
    grid-template-columns: 1fr;
    grid-template-areas: "title" "phaser" "settings" "infos";
    overflow: scroll;
  }

  h1{
    grid-area: title;
    padding-bottom: 20px;
  }

  .join-button{
    grid-area: settings;
    height: fit-content;
    align-self: center;
  }

  #players-wrapper{
    width: 80%;
    height: 80%;
    display: flex;
    flex-flow: column;
    grid-area: phaser;
    margin-top: 20px;
    justify-content: center;
    align-items: center;

    div{
      display: flex;
      margin: 10px;

      img{
        margin: 10px;
        height: 50px;
        width: auto;
      }
    }
  }

  .infos{
    grid-area: infos;
    width: 100%;
    height: 80%;
    display: flex;
    flex-flow: column;
    justify-content: space-evenly;
    align-items: center;
  }
}

</style>