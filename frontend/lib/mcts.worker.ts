// frontend/lib/mcts.worker.ts

// Assume your wasm-pack output (the .js binding file) is in './pkg' relative to this worker file.
// You might need to adjust the path and module name ('rust_mcts_games') based on your actual build output.
import init, { 
    game_new_from_config,
    game_ai_move,
    game_free,
    init_panic_hook
} from './pkg/mcts_game_pkg.js'; // Path for TS relative to worker file (frontend/lib/pkg/...)

let wasmInitialized = false;

// Modified to call init() without path
async function initializeWasm() {
    if (wasmInitialized) return;
    try {
        await init(); // Call init without arguments
        init_panic_hook(); 
        wasmInitialized = true;
        // console.log("MCTS Worker: WASM Initialized");
        self.postMessage({ type: 'workerInitialized' });
    } catch (err) {
        // console.error("MCTS Worker: Failed to initialize WASM:", err);
        self.postMessage({
            type: 'workerError',
            error: "WASM initialization failed in worker: " + (err instanceof Error ? err.message : String(err)),
        });
        throw err; 
    }
}

self.onmessage = async (event: MessageEvent) => {
    const { type, gameId, gameType, gameState, aiParams } = event.data;

    if (type === 'initWasm') {
        // console.log("MCTS Worker: Received initWasm command.");
        try {
            await initializeWasm(); // Call parameter-less version
        } catch (error) {
            console.error("MCTS Worker: initWasm command failed.", error);
        }
        return;
    }

    if (!wasmInitialized) {
        console.error("MCTS Worker: Received message before WASM was initialized. Ignoring:", event.data);
        // Post an error back or queue the message if WASM is still initializing (requires more complex state)
        self.postMessage({
            type: 'workerError',
            gameId: gameId, // If available, otherwise this error is more general
            error: "Worker received task before WASM initialization completed."
        });
        return;
    }

    if (type === 'calculateAIMove') {
        // console.log(`MCTS Worker: Received task for gameId: ${gameId}, gameType: ${gameType}`);
        let gamePtr = 0; // Using 0 as a sentinel for null pointer
        try {
            // gameState is expected to be an object like:
            // { board_state: string, current_player: string, active_multi_jump_state?: string }
            // aiParams is expected to be an object like:
            // { time_limit_ms?: number, max_simulations?: number, uct_c?: number }

            gamePtr = game_new_from_config(gameType, gameState);
            if (gamePtr === 0) {
                throw new Error('Failed to create game instance in worker.');
            }

            const chosenMoveJsValue = game_ai_move(gamePtr, aiParams);
            
            // The chosenMoveJsValue is what game_ai_move returns, already a JS value (object/number).
            // No further deserialization needed here for the move itself if Rust side serializes to JsValue.
            const chosenMove = chosenMoveJsValue;

            self.postMessage({
                type: 'aiMoveCalculated',
                gameId: gameId, // Include gameId to help main thread identify the task
                move: chosenMove,
            });

        } catch (error) {
            console.error("MCTS Worker: Error during AI calculation:", error);
            self.postMessage({
                type: 'aiMoveError',
                gameId: gameId,
                error: error instanceof Error ? error.message : String(error),
            });
        } finally {
            if (gamePtr !== 0) {
                game_free(gamePtr);
            }
        }
    } else {
        console.warn("MCTS Worker: Received unknown message type:", type);
    }
};

// Initial call to ensure WASM is loaded when the worker starts, handling potential errors.
// initializeWasm().catch(err => {
//     console.error("MCTS Worker: Failed to initialize WASM on start:", err);
//     // Post an error message back to the main thread if initialization fails critically
//     self.postMessage({
//         type: 'workerError',
//         error: "WASM initialization failed in worker: " + (err instanceof Error ? err.message : String(err)),
//     });
// });

// console.log("MCTS Worker: Script loaded. Waiting for initWasm command."); 