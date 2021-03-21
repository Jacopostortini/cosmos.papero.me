export default {
    JOIN_GAME: "join-game",
    QUIT_GAME: "quit-game",
    KICK_PLAYER: "kick-from-game",
    CHANGE_MISTER_X: "change-mister-x",
    CHAT: "chat",
    GET_GAME: "get-game",
    GAME_MODIFIED: "game-modified",
    MOVE: "move",
    USE_DOUBLE_TURN: "use-double-turn",
    END_GAME: "end-game",
    RESTART_GAME: "restart-game",

    CONNECT_TO_GAME: "connect-to-game", // -> status a me + lobby modified se status 0
    STATUS: "status", //number
    LOBBY_MODIFIED: "lobby-modified", //{players: [], currentPlayer: 0, totalTurns: 5, admin: 0}
    CHANGE_COLOR: "change-color", //number -> lobbyModified a tutti
    SET_TOTAL_TURNS: "set-total-turns", //number -> lobbyModified a tutti
    SET_VELOCITY: "set-velocity", //number -> lobbyModified a tutti
    SET_ANGULAR_VELOCITY: "set-angular-velocity", //number -> lobbyModified a tutti
    SET_RELOADING_VELOCITY: "set-reloading-velocity", //number -> lobbyModified a tutti
    START_GAME: "start-game",
}