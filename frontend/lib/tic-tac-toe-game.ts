import { GameEngine, AiMoveParams } from './game'; // Import the generic GameEngine

// Define the shape of the Tic Tac Toe board for type safety
export type TicTacToeBoard = string[]; // Array of 9 strings: "X", "O", or ""

// Define the shape of the winning line for Tic Tac Toe
export type TicTacToeWinningLine = number[]; // Array of 3 numbers (indices)

export class TicTacToeGame {
  private engine: GameEngine;

  constructor() {
    this.engine = new GameEngine("tic-tac-toe");
  }

  public async initialize(): Promise<void> {
    await this.engine.initialize();
  }

  makeMove(index: number): void {
    this.engine.makeMove(index);
  }

  async aiMove(params: AiMoveParams): Promise<any> {
    return this.engine.aiMove(params);
  }

  getBoard(): TicTacToeBoard {
    // The generic getBoard needs a type argument.
    // Rust side for TTT sends string array like ["X", "_", "O"], or JSON string of that.
    // The GameEngine's getBoard handles parsing "_" to "".
    const board = this.engine.getBoard<string[]>();
    // Ensure it's in the string[] format if parsing was generic
    if (Array.isArray(board) && board.every(item => typeof item === 'string')) {
        return board.map(cell => cell === "_" ? "" : cell); 
    }
    // Fallback or error if format is unexpected, though GameEngine should handle common cases.
    console.warn("TicTacToe getBoard: Unexpected format from engine, returning default.");
    return Array(9).fill("") as TicTacToeBoard;
  }

  // getCurrentPlayer returns "X" or "O" from WASM
  getCurrentPlayer(): string {
    return this.engine.getCurrentPlayer();
  }

  // getWinningLine returns number[] | null from WASM (or parsed by GameEngine)
  getWinningLine(): TicTacToeWinningLine | null {
    return this.engine.getWinningLine<TicTacToeWinningLine>();
  }
  
  // getWinner uses the GameEngine's generic getWinner method
  getWinner(): string | null { // "X", "O", "draw", or null
    return this.engine.getWinner();
  }

  isGameOver(): boolean {
    return this.engine.isGameOver();
  }

  free(): void {
    this.engine.free();
  }

  // Deprecated/Unused methods from the old TicTacToeGame, kept for reference if needed
  // but functionality should be covered by GameEngine or direct WASM calls if specialized.

  getStatus(): string { // Raw status like "WinX", "InProgress"
    return this.engine.getStatus();
  }
}
