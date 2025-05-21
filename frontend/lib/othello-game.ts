import { GameEngine, AiMoveParams } from './game';
export type { AiMoveParams }; // Re-export AiMoveParams

// Define the shape of the Othello board cell for type safety
export interface OthelloBoardCell {
    player: 'Black' | 'White' | null; // null for Empty
}

// Define the shape of the Othello board
export interface OthelloBoard {
    rows: OthelloBoardCell[][]; // 8x8 board
}

// Define the shape of the full game state, assembled by OthelloGame
export interface OthelloGameState {
    board: OthelloBoard | null;
    current_player: 'Black' | 'White' | null;
    game_over: boolean;
    winner: 'Black' | 'White' | 'draw' | null; // Updated to include 'draw'
    black_score: number;
    white_score: number;
    valid_moves: [number, number][]; // Array of [row, col] tuples
}

export class OthelloGame {
    private engine: GameEngine;
    private static nextGameInstanceId = 1;
    private instanceId: number;

    constructor() {
        this.instanceId = OthelloGame.nextGameInstanceId++;
        // console.log(`[OthelloGame ${this.instanceId}] Constructor called.`);
        this.engine = new GameEngine("othello");
        // console.log(`[OthelloGame ${this.instanceId}] GameEngine for Othello instantiated.`);
    }

    public async initialize(): Promise<void> {
        // console.log(`[OthelloGame ${this.instanceId}] initialize() called.`);
        await this.engine.initialize();
        // console.log(`[OthelloGame ${this.instanceId}] Engine initialized.`);
    }

    makeMove(row: number, col: number): void {
        // console.log(`[OthelloGame ${this.instanceId}] makeMove(${row}, ${col}) called.`);
        if (!this.engine.isInitialized()) {
            console.warn(`[OthelloGame ${this.instanceId}] makeMove: Engine not initialized!`);
            return;
        }
        try {
            this.engine.makeMove({ row, col });
            // console.log(`[OthelloGame ${this.instanceId}] makeMove successful.`);
        } catch (e) {
            console.error(`[OthelloGame ${this.instanceId}] Error during makeMove:`, e);
        }
    }

    async aiMove(params: AiMoveParams): Promise<any> {
        // console.log(`[OthelloGame ${this.instanceId}] aiMove called with params:`, params);
        if (!this.engine.isInitialized()) {
            console.warn(`[OthelloGame ${this.instanceId}] aiMove: Engine not initialized!`);
            return Promise.reject("Engine not initialized for aiMove");
        }
        try {
            const moveResult = await this.engine.aiMove(params);
            // console.log(`[OthelloGame ${this.instanceId}] aiMove successful, result:`, moveResult);
            return moveResult;
        } catch (e) {
            console.error(`[OthelloGame ${this.instanceId}] Error during aiMove:`, e);
            return Promise.reject(e);
        }
    }

    // Assembles the game state from generic GameEngine methods
    getGameState(): OthelloGameState | null {
        // console.log(`[OthelloGame ${this.instanceId}] getGameState() called.`);
        if (!this.engine.isInitialized()) {
            console.warn(`[OthelloGame ${this.instanceId}] getGameState: Engine not initialized! Engine ptr: ${this.engine['gamePtr'] === undefined ? 'N/A' : this.engine['gamePtr'] === null ? 'null' : 'valid_ptr_but_isInitialized_false'}`);
            return null;
        }

        try {
            const board = this.engine.getBoard<OthelloBoard>();
            const currentPlayerStr = this.engine.getCurrentPlayer(); // "Black" or "White"
            const gameOver = this.engine.isGameOver();
            const winnerStr = this.engine.getWinner(); // "Black", "White", "draw", or null
            const scores = this.engine.getScores(); // [black, white] or null
            const validMoves = (this.engine.getPossibleMovesForPiece(-1, -1) as [number, number][]) || [];

            // console.log(`[OthelloGame ${this.instanceId}] getGameState - Raw from engine: board defined: ${!!board}, player: ${currentPlayerStr}, gameOver: ${gameOver}, winner: ${winnerStr}, scores: ${JSON.stringify(scores)}, validMoves count: ${validMoves.length}`);

            let blackScore = 0;
            let whiteScore = 0;
            if (scores) {
                blackScore = scores[0];
                whiteScore = scores[1];
            }
            
            const currentPlayer = (currentPlayerStr === 'Black' || currentPlayerStr === 'White') ? currentPlayerStr : null;
            const winner = (winnerStr === 'Black' || winnerStr === 'White' || winnerStr === 'draw') ? winnerStr : null;

            const gameState: OthelloGameState = {
                board,
                current_player: currentPlayer,
                game_over: gameOver,
                winner: winner,
                black_score: blackScore,
                white_score: whiteScore,
                valid_moves: validMoves,
            };
            // console.log(`[OthelloGame ${this.instanceId}] getGameState - Assembled state:`, JSON.stringify(gameState));
            return gameState;
        } catch (e) {
            console.error(`[OthelloGame ${this.instanceId}] Error during getGameState:`, e);
            return null;
        }
    }

    // Convenience getters that now use getGameState()
    getBoard(): OthelloBoard | null {
        return this.getGameState()?.board || null;
    }

    getCurrentPlayer(): 'Black' | 'White' | null {
        return this.getGameState()?.current_player || null;
    }

    getScores(): { black: number; white: number } | null {
        const state = this.getGameState();
        if (state) {
            return { black: state.black_score, white: state.white_score };
        }
        return null;
    }

    getValidMoves(): [number, number][] {
        return this.getGameState()?.valid_moves || [];
    }

    isGameOver(): boolean {
        return this.getGameState()?.game_over ?? false;
    }

    getWinner(): 'Black' | 'White' | 'draw' | null {
        return this.getGameState()?.winner || null;
    }

    free(): void {
        // console.log(`[OthelloGame ${this.instanceId}] free() called.`);
        try {
            this.engine.free();
            this.engine.terminateWorker();
        } catch (e) {
            console.error(`[OthelloGame ${this.instanceId}] Error during free:`, e);
        }
        // console.log(`[OthelloGame ${this.instanceId}] Engine free() and terminateWorker() called.`);
    }
}
