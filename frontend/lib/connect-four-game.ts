import { GameEngine, AiMoveParams, WinningCell } from './game'; // Import the generic GameEngine

// Define the shape of the Connect Four board for type safety
// Board is string[][], where strings are "red", "yellow", or "" (empty)
export type ConnectFourBoard = string[][];

// Define the shape of the winning line for Connect Four
// It's an array of objects with row and col
export type ConnectFourWinningLine = WinningCell[];

// Define the Piece type for Connect Four, matching Rust's Piece enum (excluding None for player pieces)
export type ConnectFourPiece = "red" | "yellow";

export class ConnectFourGame {
  private engine: GameEngine;

  constructor() {
    this.engine = new GameEngine("connect-four");
  }

  public async initialize(): Promise<void> {
    await this.engine.initialize();
  }

  // For Connect Four, the move is the column number
  makeMove(column: number): void {
    this.engine.makeMove(column);
  }

  async aiMove(params: AiMoveParams): Promise<any> {
    return this.engine.aiMove(params);
  }

  getBoard(): ConnectFourBoard {
    // Rust side for ConnectFour sends a JSON string of Piece[][] which becomes string[][] after parsing.
    // Piece::None from Rust should be handled appropriately (e.g., as "" by convention if not done in Rust stringification).
    // The GameEngine's getBoard parses the JSON string.
    const board = this.engine.getBoard<string[][]>();
    // Ensure it's in the string[][] format
    if (Array.isArray(board) && board.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string'))) {
      // Replace Rust's "None" with "" for frontend consistency if Rust serializes it that way
      // Or, if Rust serializes Player::Red as "Red", convert to "red"
      return board.map(row => 
        row.map(cell => {
          if (cell === "None") return ""; // Assuming Rust serializes Player::None as "None"
          if (cell === "Red") return "red";
          if (cell === "Yellow") return "yellow";
          return cell; // "red", "yellow", or already ""
        })
      );
    }
    console.warn("ConnectFour getBoard: Unexpected format from engine, returning default.");
    // Default to a 6x7 empty board
    return Array(6).fill(null).map(() => Array(7).fill("")) as ConnectFourBoard;
  }

  // getCurrentPlayer returns "red" or "yellow" from WASM
  getCurrentPlayer(): ConnectFourPiece {
    return this.engine.getCurrentPlayer() as ConnectFourPiece;
  }

  // getWinningLine returns WinningCell[] | null from WASM (parsed by GameEngine)
  getWinningLine(): ConnectFourWinningLine | null {
    return this.engine.getWinningLine<ConnectFourWinningLine>();
  }
  
  // getWinner uses the GameEngine's generic getWinner method
  getWinner(): string | null { // "red", "yellow", "draw", or null
    return this.engine.getWinner();
  }

  isGameOver(): boolean {
    return this.engine.isGameOver();
  }

  free(): void {
    this.engine.free();
  }

  // Add getStatus method
  getStatus(): string {
    return this.engine.getStatus();
  }
}
