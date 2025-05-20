import init, {
  game_new,
  game_free,
  game_make_move,
  game_get_board,
  game_get_status,
  game_get_current_player,
  game_get_winning_line,
  init_panic_hook, // Make sure this is exported from your lib.rs if you plan to use it
  game_get_possible_moves_for_piece, // Import the new function
  game_is_in_multi_jump, // Import the new multi-jump status function
  game_get_scores, // <<< Added import for new generic function
} from "./pkg/mcts_game_pkg.js"; // Path for TS type checking

// Call init_panic_hook once when your app loads if desired
// e.g., in _app.tsx or a top-level layout component
// if (typeof window !== 'undefined') { 
//   console.log("Initializing panic hook globally.");
//   init_panic_hook();
// }

// To ensure WASM is initialized only once.
let globalWasmInitialized = false;
const initializeWasm = async () => {
  if (!globalWasmInitialized) {
    await init(); // Call init without arguments
    init_panic_hook(); // Initialize panic hook after WASM is loaded
    globalWasmInitialized = true;
    // console.log("WASM module initialized globally for main thread, panic hook set.");
    // init_panic_hook(); 
  }
};

export interface AiMoveParams {
  timeLimitMs?: number;
  maxSimulations?: number;
  uctC?: number; // Corresponds to uct_c in Rust AiParams struct
}

export interface WinningCell {
    row: number;
    col: number;
}

export class GameEngine {
  private gamePtr: BigInt | number | null = null;
  private gameType: string;
  private aiWorker: Worker | null = null;
  private static nextGameId = 1; // For tracking worker requests
  private activeAiMovePromises: Map<number, { resolve: (move: any) => void, reject: (reason?: any) => void }> = new Map();
  private static nextEngineInstanceId = 1;
  private instanceId: number;

  constructor(gameType: string) {
    this.instanceId = GameEngine.nextEngineInstanceId++;
    // console.log(`[GameEngine ${this.instanceId}] Constructor for ${gameType}`);
    this.gameType = gameType;
    if (typeof Worker !== 'undefined') { // Check if Worker is available (not in SSR)
        try {
            this.aiWorker = new Worker(new URL('./mcts.worker.ts', import.meta.url), { type: 'module' });
            // console.log(`[GameEngine ${this.instanceId}] AI Worker created for ${gameType}`);
            
            // Tell the worker to initialize its WASM instance
            this.aiWorker.postMessage({ type: 'initWasm' }); // No path needed anymore

            this.aiWorker.onmessage = (event: MessageEvent) => {
                const { type, gameId, move: chosenMove, error, message } = event.data;
                
                if (type === 'workerInitialized') {
                    // console.log(`[GameEngine ${this.instanceId}] AI Worker reported initialization.`);
                    // You could set a flag here if needed: this.isWorkerInitialized = true;
                    return;
                }
                if (type === 'workerError' && !gameId) { // Global worker error not tied to a specific gameId
                    console.error(`[GameEngine ${this.instanceId}] Global worker error:`, error || message);
                    this.activeAiMovePromises.forEach(cb => cb.reject(new Error("Worker failed: " + (error || message))));
                    this.activeAiMovePromises.clear();
                    // Potentially terminate and attempt to re-initialize worker on next call or mark as unusable.
                    return;
                }

                const promiseCallbacks = this.activeAiMovePromises.get(gameId);

                if (promiseCallbacks) {
                    if (type === 'aiMoveCalculated') {
                        // console.log(`[GameEngine ${this.instanceId}] Received AI move for gameId ${gameId}:`, chosenMove);
                        promiseCallbacks.resolve(chosenMove);
                    } else if (type === 'aiMoveError') {
                        console.error(`[GameEngine ${this.instanceId}] AI move error for gameId ${gameId}:`, error);
                        promiseCallbacks.reject(new Error(error));
                    } else if (type === 'workerError') { 
                        console.error(`[GameEngine ${this.instanceId}] Worker error reported for gameId ${gameId}:`, error);
                        promiseCallbacks.reject(new Error(error));
                    }
                    this.activeAiMovePromises.delete(gameId);
                } else {
                    console.warn(`[GameEngine ${this.instanceId}] Received worker message for unknown gameId or stale request:`, event.data);
                }
            };
            this.aiWorker.onerror = (error: ErrorEvent) => {
                console.error(`[GameEngine ${this.instanceId}] AI Worker error:`, error.message, error);
                // Reject all active promises for this worker
                this.activeAiMovePromises.forEach(cb => cb.reject(new Error("Worker errored: " + error.message)));
                this.activeAiMovePromises.clear();
                // Consider terminating and nullifying the worker, to be recreated on next aiMove call.
                if (this.aiWorker) {
                    this.aiWorker.terminate();
                    this.aiWorker = null;
                    // console.log(`[GameEngine ${this.instanceId}] Terminated worker due to error.`);
                }
            };
        } catch (e) {
            console.error(`[GameEngine ${this.instanceId}] Failed to create AI worker:`, e);
            this.aiWorker = null; // Ensure it's null if creation failed
        }
    }
  }

  public async initialize(): Promise<void> {
    // console.log(`[GameEngine ${this.instanceId}] initialize() called for ${this.gameType}. Current gamePtr: ${this.gamePtr}`);
    await initializeWasm(); // Ensure WASM is loaded before creating a game instance

    if (this.gamePtr !== null && BigInt(this.gamePtr as number) !== 0n) {
        console.warn(`[GameEngine ${this.instanceId}] Game engine for ${this.gameType} already initialized. Freeing old instance first. Old gamePtr: ${this.gamePtr}`);
        this.free(); // Free previous instance if any
    }
    
    // console.log(`[GameEngine ${this.instanceId}] Calling game_new for ${this.gameType}`);
    this.gamePtr = game_new(this.gameType);
    if (this.gamePtr === null || BigInt(this.gamePtr as number) === 0n) {
      console.error(`[GameEngine ${this.instanceId}] Failed to create ${this.gameType} game instance in WASM. game_new returned: ${this.gamePtr}`);
      throw new Error(`[GameEngine ${this.instanceId}] Failed to create ${this.gameType} game instance in WASM.`);
    }
    // console.log(`[GameEngine ${this.instanceId}] ${this.gameType} WASM game instance created, ptr: ${this.gamePtr}`);
  }

  public isInitialized(): boolean {
    const initialized = this.gamePtr !== null && BigInt(this.gamePtr as number) !== 0n;
    // console.log(`[GameEngine ${this.instanceId}] isInitialized() check for ${this.gameType}: ${initialized}, gamePtr: ${this.gamePtr}`);
    return initialized;
  }

  private ensureInitialized(): void {
    if (this.gamePtr === null || BigInt(this.gamePtr as number) === 0n) {
      const errorMessage = `[GameEngine ${this.instanceId}] Game not initialized for ${this.gameType}. Call initialize() first. Current gamePtr: ${this.gamePtr}`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  // Make a move (for human player)
  // moveData type depends on the game (e.g., number for TTT, column number for ConnectFour)
  makeMove(moveData: any): void {
    // console.log(`[GameEngine ${this.instanceId}] makeMove called for ${this.gameType} with:`, JSON.stringify(moveData));
    this.ensureInitialized();
    try {
      game_make_move(this.gamePtr as number, moveData);
      // console.log(`[GameEngine ${this.instanceId}] makeMove successful for ${this.gameType}.`);
    } catch (e) {
      console.error(`[GameEngine ${this.instanceId}] Error in WASM makeMove for ${this.gameType}:`, e);
      throw e;
    }
  }

  // Trigger AI move
  async aiMove(params: AiMoveParams): Promise<any> { // Return Promise<any> for the move
    // console.log(`[GameEngine ${this.instanceId}] aiMove called for ${this.gameType}. Params:`, params);
    this.ensureInitialized();
    if (!this.aiWorker) {
        console.warn(`[GameEngine ${this.instanceId}] AI Worker is null. Attempting to re-initialize for ${this.gameType}.`);
        if (typeof Worker !== 'undefined') {
            try {
                // console.log(`[GameEngine ${this.instanceId}] Attempting to re-initialize AI worker.`);
                this.aiWorker = new Worker(new URL('./mcts.worker.ts', import.meta.url), { type: 'module' });
                
                this.aiWorker.postMessage({ type: 'initWasm' }); // No path needed for re-init either

                this.aiWorker.onmessage = (event: MessageEvent) => { 
                    const { type, gameId, move: chosenMove, error, message } = event.data;
                     if (type === 'workerInitialized') {
                        // console.log(`[GameEngine ${this.instanceId}] Re-initialized AI Worker reported initialization.`);
                        return;
                    }
                    if (type === 'workerError' && !gameId) {
                        console.error(`[GameEngine ${this.instanceId}] Global worker error on re-init:`, error || message);
                        this.activeAiMovePromises.forEach(cb => cb.reject(new Error("Worker failed on re-init: " + (error || message))));
                        this.activeAiMovePromises.clear();
                        return;
                    }
                    const promiseCallbacks = this.activeAiMovePromises.get(gameId);
                    if (promiseCallbacks) {
                        if (type === 'aiMoveCalculated') {
                            //  console.log(`[GameEngine ${this.instanceId}] Re-initialized worker: Received AI move for gameId ${gameId}:`, chosenMove);
                            promiseCallbacks.resolve(chosenMove);
                        } else if (type === 'aiMoveError') {
                            console.error(`[GameEngine ${this.instanceId}] Re-initialized worker: AI move error for gameId ${gameId}:`, error);
                            promiseCallbacks.reject(new Error(error));
                        } else if (type === 'workerError') {
                             console.error(`[GameEngine ${this.instanceId}] Re-initialized worker: Worker error reported for gameId ${gameId}:`, error);
                            promiseCallbacks.reject(new Error(error));
                        }
                        this.activeAiMovePromises.delete(gameId);
                    } else {
                         console.warn(`[GameEngine ${this.instanceId}] Re-initialized worker sent message for unknown gameId:`, event.data);
                    }
                };
                this.aiWorker.onerror = (errorEvent: ErrorEvent) => { 
                    console.error(`[GameEngine ${this.instanceId}] Re-initialized AI Worker error:`, errorEvent.message, errorEvent);
                    this.activeAiMovePromises.forEach(cb => cb.reject(new Error("Re-initialized worker errored: " + errorEvent.message)));
                    this.activeAiMovePromises.clear();
                    if (this.aiWorker) {
                        this.aiWorker.terminate();
                        this.aiWorker = null;
                        // console.log(`[GameEngine ${this.instanceId}] Terminated re-initialized worker due to error.`);
                    }
                };
                //  console.log(`[GameEngine ${this.instanceId}] AI worker re-initialized successfully.`);
            } catch (e) {
                console.error(`[GameEngine ${this.instanceId}] Failed to re-create AI worker:`, e);
                this.aiWorker = null;
                return Promise.reject(new Error(`[GameEngine ${this.instanceId}] AI Worker is not available and could not be re-created.`));
            }
        }
        if (!this.aiWorker) {
            console.error(`[GameEngine ${this.instanceId}] AI Worker is definitively not available for ${this.gameType}.`);
             return Promise.reject(new Error(`[GameEngine ${this.instanceId}] AI Worker is not available.`));
        }
    }

    const gameId = GameEngine.nextGameId++;
    // console.log(`[GameEngine ${this.instanceId}] Preparing AI move for gameId ${gameId}, gameType ${this.gameType}.`);

    const boardStateResult:any = game_get_board(this.gamePtr as number);
    // console.log(`[GameEngine ${this.instanceId}] aiMove (gameId ${gameId}): boardStateResult typeof is ${typeof boardStateResult}, value is:`, boardStateResult);
    const currentPlayerLowercase = game_get_current_player(this.gamePtr as number); 
    const currentPlayerForWorker = currentPlayerLowercase.charAt(0).toUpperCase() + currentPlayerLowercase.slice(1);
    // console.log(`[GameEngine ${this.instanceId}] aiMove (gameId ${gameId}): Current player for worker: ${currentPlayerForWorker}`);
    
    let finalBoardStateString: string;
    if (this.gameType === "tic-tac-toe") {
        // For TicTacToe, game_get_board likely returns an array like ["X", "_", "_"...]
        // The Rust side for TicTacToe load_state expects a 9-character string like "X________".
        if (Array.isArray(boardStateResult)) {
            finalBoardStateString = boardStateResult.map(cell => cell === "" ? "_" : cell).join("");
        } else if (typeof boardStateResult === 'string') {
            // If it's already a string, assume it's in the correct 9-char format or can be parsed
            // This might need more robust parsing if the string format isn't guaranteed.
            finalBoardStateString = boardStateResult; 
        } else {
            console.error(`Unexpected boardState format for TicTacToe: ${typeof boardStateResult}`, boardStateResult);
            finalBoardStateString = "_________"; // Fallback, should trigger error in Rust if not valid
        }
    } else {
        // For other games (ConnectFour, Othello, Checkers)
        if (typeof boardStateResult === 'string') {
            finalBoardStateString = boardStateResult;
        } else { // boardStateResult is an object/array
            // If it's not a string, then we must stringify it.
            // For Othello and ConnectFour, this is typically expected behavior.
            // For Checkers, it might be unexpected if Rust was supposed to send a pre-stringified state.
            if (this.gameType === "checkers") {
                console.warn(`AI_MOVE_DEBUG: Checkers' boardStateResult was an object (type: ${typeof boardStateResult}), not a string. Stringifying. This might be unexpected if Rust intended to send a pre-stringified state.`);
            }
            // For all non-TicTacToe games, if boardStateResult is not a string, stringify it.
            finalBoardStateString = JSON.stringify(boardStateResult);
        }
    }

    let gameStatePayload: any = {
        board_state: finalBoardStateString,
        current_player: currentPlayerForWorker, // Use capitalized version
    };

    if (this.gameType === "checkers") {
        const multiJumpState = game_is_in_multi_jump(this.gamePtr as number);
        // multiJumpState is already a JSON string from Rust {active: bool, row?: number, col?: number}
        gameStatePayload.active_multi_jump_state = multiJumpState;
    }

    const aiParamsForRust = {
        time_limit_ms: params.timeLimitMs,
        max_simulations: params.maxSimulations,
        uct_c: params.uctC,
    };

    return new Promise((resolve, reject) => {
        this.activeAiMovePromises.set(gameId, { resolve, reject });

        // console.log(`GameEngine (${this.gameType}): Sending task to worker. GameId: ${gameId}, Type: ${this.gameType}, State:`, gameStatePayload, "Params:", aiParamsForRust);
        this.aiWorker!.postMessage({
            type: 'calculateAIMove',
            gameId: gameId,
            gameType: this.gameType,
            gameState: gameStatePayload,
            aiParams: aiParamsForRust,
        });
    });
  }

  // Get the board state
  // Return type will need parsing based on how Rust sends it (e.g., JSON string)
  getBoard<T>(): T {
    this.ensureInitialized();
    const boardJsValue = game_get_board(this.gamePtr as number);
    try {
        // Case 1: Rust returns a JSON string for the board
        if (typeof boardJsValue === 'string') {
            return JSON.parse(boardJsValue) as T;
        }
        // Case 2: Rust returns a direct object/array (e.g., for Othello from serde_wasm_bindgen::to_value)
        // or for TicTacToe if it wasn't stringified in Rust.
        if (typeof boardJsValue === 'object' && boardJsValue !== null) {
            if (this.gameType === "tic-tac-toe" && Array.isArray(boardJsValue)) {
                 // Specific handling for TicTacToe if it comes as a direct array (e.g. ["X", "_", ...])
                return boardJsValue.map(cell => cell === "_" ? "" : cell) as T; 
            }
            // For Othello and potentially other games returning direct objects via serde_wasm_bindgen::to_value
            return boardJsValue as T; 
        }
        
        // Fallback for unexpected formats
        console.warn(`Unexpected board format from WASM for ${this.gameType}. Type: ${typeof boardJsValue}, Value:`, boardJsValue);
        throw new Error ("Unexpected board format from WASM");
    } catch (e) {
        console.error(`Error parsing board for ${this.gameType}:`, e, "Raw value:", boardJsValue);
        throw new Error(`Could not parse board from WASM for ${this.gameType}.`);
    }
  }

  // Get game status (e.g., "InProgress", "WinX", "WinRed", "Draw")
  getStatus(): string {
    this.ensureInitialized();
    return game_get_status(this.gamePtr as number);
  }

  // Get current player (e.g., "X", "O", "red", "yellow")
  getCurrentPlayer(): string {
    this.ensureInitialized();
    return game_get_current_player(this.gamePtr as number);
  }

  // Get winning line information
  // Return type will need parsing (e.g., JSON string to array or null)
  getWinningLine<T>(): T | null {
    this.ensureInitialized();
    const winningLineJsValue = game_get_winning_line(this.gamePtr as number);
    if (winningLineJsValue === null) { // Check for JS null from wasm-bindgen for JsValue::NULL
        return null;
    }
    try {
        // Assuming Rust returns a JSON string for the winning line (or null already handled)
        if (typeof winningLineJsValue === 'string') {
            const parsed = JSON.parse(winningLineJsValue);
            // Ensure it's an array or null after parsing (Rust might send string "null")
            return (parsed === null || Array.isArray(parsed)) ? parsed as T : null;
        }
        // For TicTacToe, it might return a direct array or null
        if (this.gameType === "tic-tac-toe" && (Array.isArray(winningLineJsValue) || winningLineJsValue === null)) {
            return winningLineJsValue as T | null;
        }
        console.warn(`Unexpected winning line format from WASM for ${this.gameType}:`, winningLineJsValue);
        return null;
    } catch (e) {
        console.error(`Error parsing winning line for ${this.gameType}:`, e, "Raw value:", winningLineJsValue);
        return null; 
    }
  }

  // Free WASM memory for this game instance
  free(): void {
    // console.log(`[GameEngine ${this.instanceId}] free() called for ${this.gameType}. Current gamePtr: ${this.gamePtr}`);
    if (this.gamePtr !== null && BigInt(this.gamePtr as number) !== 0n) {
      // console.log(`[GameEngine ${this.instanceId}] Freeing WASM game instance for ${this.gameType}, ptr: ${this.gamePtr}`);
      game_free(this.gamePtr as number);
      this.gamePtr = null;
      // console.log(`[GameEngine ${this.instanceId}] gamePtr set to null after freeing for ${this.gameType}.`);
    } else {
      // console.log(`[GameEngine ${this.instanceId}] No valid gamePtr to free for ${this.gameType}. gamePtr: ${this.gamePtr}`);
    }
    // Do not terminate worker here as it's shared/reused conceptually,
    // but clear promises related to this engine instance if any were specific (not applicable with current design)
  }

  // Method to terminate the worker explicitly if needed, e.g., when the main component unmounts
  public terminateWorker(): void {
    // console.log(`[GameEngine ${this.instanceId}] terminateWorker() called for ${this.gameType}.`);
    if (this.aiWorker) {
      // console.log(`[GameEngine ${this.instanceId}] Terminating AI worker for ${this.gameType}.`);
      this.aiWorker.terminate();
      this.aiWorker = null;
      // console.log(`[GameEngine ${this.instanceId}] AI worker for ${this.gameType} terminated and set to null.`);
    }
    // Clear any pending promises as the worker is gone
    this.activeAiMovePromises.forEach(cb => cb.reject(new Error("Worker terminated externally.")));
    this.activeAiMovePromises.clear();
  }

  // --- Game-specific helper methods (derived from status) ---

  // Provides a more generic way to check if game is over
  isGameOver(): boolean {
    // If getWinner() returns a player string or "draw", the game is over.
    // If getWinner() returns null, the game is still in progress according to current getWinner() logic.
    return this.getWinner() !== null;
  }

  // Provides a generic way to get winner: "player1", "player2", "draw", or null
  // This needs to be mapped based on game-specific status strings
  getWinner(): string | null {
    const status = this.getStatus();
    if (this.gameType === "tic-tac-toe") {
        if (status === "WinX") return "X"; // Player 1 in TTT
        if (status === "WinO") return "O"; // Player 2 in TTT
        if (status === "Draw") return "draw";
    } else if (this.gameType === "connect-four") {
        if (status === "WinRed") return "red"; // Player 1 in Connect Four
        if (status === "WinYellow") return "yellow"; // Player 2 in Connect Four
        if (status === "Draw") return "draw";
    } else if (this.gameType === "checkers") {
        // Example: Adapt for Checkers status strings
        if (status === "WinRed") return "red"; // Assuming red is a player
        if (status === "WinBlack") return "black"; // Assuming black is a player
        if (status === "Draw") return "draw";
    } else if (this.gameType === "othello") {
        if (status === "Game Over. Winner: Black") return "Black";
        if (status === "Game Over. Winner: White") return "White";
        if (status === "Game Over. Draw!") return "draw";
    }
    // Add other game types as needed
    return null; // If InProgress or unrecognized status
  }

  // New method for Checkers (and potentially other games)
  // to get possible moves for a specific piece.
  // This assumes the WASM function game_get_possible_moves_for_piece exists and
  // takes (game_ptr, row, col) and returns a JSON string of moves.
  getPossibleMovesForPiece(row: number, col: number): string | any[] | null {
    this.ensureInitialized();
    if (typeof game_get_possible_moves_for_piece === 'function') {
      // The actual WASM function might return a JSON string or an already parsed object/array
      // depending on wasm-bindgen settings and return type (JsValue).
      // Assuming it returns JsValue which might be a string that needs parsing.
      const movesJsValue = game_get_possible_moves_for_piece(this.gamePtr as number, row, col);
      // The checkers-game.ts will handle parsing this string to CheckersMove[]
      return movesJsValue; 
    } else {
      console.warn(`game_get_possible_moves_for_piece not available in WASM module for ${this.gameType}`);
      return null;
    }
  }

  // New method to get multi-jump status
  getIsInMultiJump(): string | null { // Returns JSON string from WASM
    this.ensureInitialized();
    if (typeof game_is_in_multi_jump === 'function') {
      return game_is_in_multi_jump(this.gamePtr as number) as string;
    } else {
      console.warn(`game_is_in_multi_jump not available in WASM module for ${this.gameType}`);
      return "{\"active\": false}"; // Default to not active
    }
  }

  // NEW generic methods
  getScores(): [number, number] | null {
    this.ensureInitialized();
    if (typeof game_get_scores === 'function') {
      const scoresJsValue = game_get_scores(this.gamePtr as number);
      try {
        // Assuming Rust returns a JSON array like [blackScore, whiteScore] or null
        if (scoresJsValue === null) return null;
        // The actual type might be an array directly from wasm-bindgen if it's not a complex object
        if (Array.isArray(scoresJsValue) && scoresJsValue.length === 2 && 
            typeof scoresJsValue[0] === 'number' && typeof scoresJsValue[1] === 'number') {
          return scoresJsValue as [number, number];
        }
        // If it's a string, parse it (less likely for simple array/tuple from serde_wasm_bindgen)
        if (typeof scoresJsValue === 'string') {
            const parsed = JSON.parse(scoresJsValue);
            if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === 'number' && typeof parsed[1] === 'number') {
                return parsed as [number, number];
            }
        }
        console.warn(`Unexpected scores format from WASM for ${this.gameType}:`, scoresJsValue);
        return null;
      } catch (e) {
        console.error(`Error parsing scores for ${this.gameType}:`, e, "Raw value:", scoresJsValue);
        return null;
      }
    } else {
      console.warn(`game_get_scores not available in WASM module.`);
      return null;
    }
  }
}

// Optional: Export the init_panic_hook if components need to call it individually,
// though global initialization is often preferred.
export { init_panic_hook }; 