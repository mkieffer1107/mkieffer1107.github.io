import { GameEngine, AiMoveParams } from './game';

// NEW Type Definitions
export interface RustPiece { // Mirrors the Rust Piece struct
  player: "Red" | "Black";
  piece_type: "Man" | "King";
}
export type CheckersBoardCell = RustPiece | null;
export type CheckersBoard = CheckersBoardCell[][];

// Define the shape of a move object (from Rust)
export interface CheckersMove {
  from_row: number;
  from_col: number;
  to_row: number;
  to_col: number;
  is_capture: boolean;
  captured_pos: [number, number] | null;
}

export interface MultiJumpData {
  active: boolean;
  row?: number;
  col?: number;
}

export class CheckersGame {
  private engine: GameEngine;

  constructor() {
    this.engine = new GameEngine("checkers");
  }

  public async initialize(): Promise<void> {
    await this.engine.initialize();
  }

  // Frontend uses an encoded move: (fromPos << 6) | toPos
  // fromPos = from_row * 8 + from_col
  makeMove(moveData: CheckersMove): void {
    this.engine.makeMove(moveData);
  }

  async aiMove(params: AiMoveParams): Promise<any> {
    return this.engine.aiMove(params);
  }

  getBoard(): CheckersBoard {
    return this.engine.getBoard<CheckersBoard>();
  }

  // getCurrentPlayer returns "red" or "black" from WASM
  getCurrentPlayer(): "red" | "black" {
    const player = this.engine.getCurrentPlayer();
    if (player === "red" || player === "black") {
        return player;
    }
    console.warn(`Unexpected current player from WASM: ${player}, defaulting to black`);
    return "black"; // Fallback, though Rust should always return "red" or "black"
  }

  // getWinningLine for Checkers will likely return null (or empty array if parsed from "null" string)
  // As Checkers doesn't have a "line" like TTT/C4.
  getWinningLine(): any | null { // Type any as Rust returns JSON "null" string
    return this.engine.getWinningLine<any>(); 
  }
  
  getWinner(): "red" | "black" | "draw" | null {
    const winner = this.engine.getWinner();
    // GameEngine's getWinner maps "WinRed" to "red", "WinBlack" to "black"
    if (winner === "red" || winner === "black" || winner === "draw") {
        return winner;
    }
    return null; // InProgress or unrecognized
  }

  isGameOver(): boolean {
    return this.engine.isGameOver();
  }

  // Custom method for Checkers to get possible moves for a piece
  getPossibleMovesForPiece(fromRow: number, fromCol: number): CheckersMove[] {
    if (!this.engine.isInitialized()) {
        console.warn("CheckersGame.getPossibleMovesForPiece: Engine not initialized");
        return [];
    }
    // This will call the new game_get_possible_moves_for_piece WASM function
    const movesJson = this.engine.getPossibleMovesForPiece(fromRow, fromCol);
    try {
        if (typeof movesJson === 'string') {
            return JSON.parse(movesJson) as CheckersMove[];
        }
        // If it's already an array (less likely if WASM returns string from JsValue::from_str)
        if (Array.isArray(movesJson)) {
            return movesJson as CheckersMove[];
        }
        return [];
    } catch (e) {
        console.error("Error parsing possible moves for piece:", e, "Raw value:", movesJson);
        return [];
    }
  }

  isInMultiJump(): MultiJumpData {
    if (!this.engine.isInitialized()) {
        console.warn("CheckersGame.isInMultiJump: Engine not initialized");
        return { active: false };
    }
    const multiJumpJson = this.engine.getIsInMultiJump();
    try {
        if (typeof multiJumpJson === 'string') {
            return JSON.parse(multiJumpJson) as MultiJumpData;
        }
        // Should not happen if WASM always returns string from GameEngine
        console.warn("isInMultiJump: multiJumpJson was not a string, returning default.", multiJumpJson);
        return { active: false }; 
    } catch (e) {
        console.error("Error parsing multi-jump info:", e, "Raw value:", multiJumpJson);
        return { active: false };
    }
  }

  free(): void {
    this.engine.free();
  }

  // Add getStatus method
  getStatus(): string {
    return this.engine.getStatus();
  }
}
