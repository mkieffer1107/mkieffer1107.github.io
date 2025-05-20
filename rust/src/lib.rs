mod mcts;
mod games;
use serde_wasm_bindgen::from_value;
use wasm_bindgen::prelude::*;
use serde::{Serialize, Deserialize};
use games::othello::Othello as OthelloGame;
use crate::mcts::engine::{run as run_mcts, StopCriteria};
use web_time::Duration;
// use web_sys::console;

// Import game structs
use games::tic_tac_toe::TicTacToeGame;
use games::connect_four::ConnectFourGame; 
use games::checkers::CheckersGame;

// This enum is Rust-internal now (re-adding)
pub enum GameWrapper {
    TicTacToe(TicTacToeGame),
    ConnectFour(ConnectFourGame),
    Checkers(CheckersGame),
    Othello(OthelloGame),
}

#[wasm_bindgen]
pub fn init_panic_hook() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

#[derive(Serialize, Deserialize)]
struct OthelloBoardCell {
    player: Option<String>, // "Black", "White", or null for Empty
}

#[derive(Serialize, Deserialize)]
struct OthelloBoard {
    rows: Vec<Vec<OthelloBoardCell>>,
}

#[derive(Serialize, Deserialize)]
pub struct GameConfig {
    board_state: String,
    current_player: String,
    active_multi_jump_state: Option<String>,
    // Add other relevant common parameters here
    // For game-specific parameters, consider a nested structure or a general JsValue
    // For example:
    // tic_tac_toe_specific: Option<TicTacToeConfig>,
    // connect_four_specific: Option<ConnectFourConfig>,
}

#[wasm_bindgen]
pub fn game_new_from_config(game_type: &str, config_val: JsValue) -> Result<*mut GameWrapper, JsValue> {
    let config: GameConfig = from_value(config_val).map_err(|e| JsValue::from_str(&format!("Invalid config: {}", e)))?;

    // TODO: Implement actual deserialization and state application for each game type
    // This will involve parsing config.board_state, config.current_player, etc.
    // and calling appropriate methods on the game instances.

    let game_instance = match game_type {
        "tic-tac-toe" => {
            let mut game = TicTacToeGame::new();
            game.load_state(&config.board_state, &config.current_player)
                .map_err(|e| JsValue::from_str(&format!("Failed to load TicTacToe state: {:?}", e)))?;
            GameWrapper::TicTacToe(game)
        }
        "connect-four" => {
            let mut game = ConnectFourGame::new();
            game.load_state(&config.board_state, &config.current_player)
                .map_err(|e| JsValue::from_str(&format!("Failed to load ConnectFour state: {:?}", e)))?;
            GameWrapper::ConnectFour(game)
        }
        "checkers" => {
            let mut game = CheckersGame::new();
            game.load_state(
                &config.board_state, 
                &config.current_player, 
                config.active_multi_jump_state.as_deref() // Convert Option<String> to Option<&str>
            ).map_err(|e| JsValue::from_str(&format!("Failed to load Checkers state: {:?}", e)))?;
            GameWrapper::Checkers(game)
        }
        "othello" => {
            let mut game = OthelloGame::new();
            game.load_state(&config.board_state, &config.current_player)
                .map_err(|e| JsValue::from_str(&format!("Failed to load Othello state: {}", e)))?;
            GameWrapper::Othello(game)
        }
        _ => return Err(JsValue::from_str(&format!("Unknown game type: {}", game_type))),
    };
    let boxed_game = Box::new(game_instance);
    Ok(Box::into_raw(boxed_game))
}

#[wasm_bindgen]
pub fn game_new(game_type: &str) -> Result<*mut GameWrapper, JsValue> {
    let game_instance = match game_type {
        "tic-tac-toe" => GameWrapper::TicTacToe(TicTacToeGame::new()),
        "connect-four" => GameWrapper::ConnectFour(ConnectFourGame::new()), // Assuming new() exists
        "checkers" => GameWrapper::Checkers(CheckersGame::new()), 
        "othello" => GameWrapper::Othello(OthelloGame::new()),
        _ => return Err(JsValue::from_str(&format!("Unknown game type: {}", game_type))),
    };
    let boxed_game = Box::new(game_instance);
    Ok(Box::into_raw(boxed_game))
}

// Function to free the memory when JS is done with the game object
#[wasm_bindgen]
pub fn game_free(game_ptr: *mut GameWrapper) {
    if !game_ptr.is_null() {
        unsafe {
            let _ = Box::from_raw(game_ptr);
        }
    }
}

#[wasm_bindgen]
pub fn game_make_move(game_ptr: *mut GameWrapper, move_params: JsValue) -> Result<(), JsValue> {
    let game = unsafe { &mut *game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => {
            let index: usize = from_value(move_params).map_err(|e| JsValue::from_str(&format!("Invalid move params: {}", e)))?;
            g.make_move(index)
        }
        GameWrapper::ConnectFour(g) => {
            let col: usize = from_value(move_params).map_err(|e| JsValue::from_str(&format!("Invalid move params for Connect Four: {}", e)))?;
            g.make_player_move(col) // Using the public make_player_move
        }
        GameWrapper::Checkers(g) => {
            // move_params is already JsValue, which CheckersGame::make_player_move now expects
            g.make_player_move(move_params)
        }
        GameWrapper::Othello(g) => {
            #[derive(Deserialize)]
            struct OthelloMove {
                row: usize,
                col: usize,
            }
            let othello_move: OthelloMove = from_value(move_params).map_err(|e| JsValue::from_str(&format!("Invalid move params for Othello: {}", e)))?;
            g.make_move(othello_move.row, othello_move.col).map_err(|e| JsValue::from_str(&e))
        }
    }
}

#[wasm_bindgen]
pub fn game_ai_move(game_ptr: *mut GameWrapper, ai_params: JsValue) -> Result<JsValue, JsValue> {
    let game = unsafe { &mut *game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => {
            // g.ai_move(ai_params) should now return the move
            // TODO: Ensure TicTacToeGame::ai_move returns the move and it's serializable to JsValue
            let chosen_move_jsvalue = g.ai_move(ai_params)?; // Assuming ai_move now returns Result<JsValue, JsValue>
            Ok(chosen_move_jsvalue)
        }
        GameWrapper::ConnectFour(g) => {
            // g.ai_move(ai_params) should now return the move
            // TODO: Ensure ConnectFourGame::ai_move returns the move and it's serializable to JsValue
            let chosen_move_jsvalue = g.ai_move(ai_params)?;
            Ok(chosen_move_jsvalue)
        }
        GameWrapper::Checkers(g) => {
            // CheckersGame::ai_move now returns Result<JsValue, JsValue> containing the serialized Move.
            g.ai_move(ai_params) // Directly return the Result<JsValue, JsValue>
        }
        GameWrapper::Othello(g) => {
            #[derive(Deserialize)]
            struct AiParamsRust {
                time_limit_ms: Option<u64>,
                max_simulations: Option<u32>,
                uct_c: Option<f32>,
            }
            let params: AiParamsRust = from_value(ai_params).map_err(|e| JsValue::from_str(&format!("Invalid AI params for Othello: {}", e)))?;

            // console::log_1(&format!("[Rust Lib] game_ai_move for Othello: Parsed AI params: time_limit_ms: {:?}, max_simulations: {:?}, uct_c: {:?}", params.time_limit_ms, params.max_simulations, params.uct_c).into());

            let stop_criteria = if let Some(time_ms) = params.time_limit_ms {
                StopCriteria::Time(Duration::from_millis(time_ms))
            } else if let Some(sims) = params.max_simulations {
                StopCriteria::Simulations(sims)
            } else {
                // Default to 1 second if no criteria provided, or handle error
                // StopCriteria::Time(Duration::from_secs(1))
                return Err(JsValue::from_str("Othello AI move requires either time_limit_ms or max_simulations"));
            };

            // The MCTS engine expects a mutable reference to the game state to potentially make
            // internal copies or modifications if its design requires. However, our GameState trait
            // for Othello has apply_action returning a new state (cloning).
            // The MCTS engine `run` function takes `root: &S` (an immutable reference).
            // It will clone the root internally to start its process.
            // console::log_1(&"[Rust Lib] game_ai_move for Othello: Calling run_mcts".into());
            let best_action = run_mcts(g, stop_criteria, params.uct_c);
            // console::log_1(&format!("[Rust Lib] game_ai_move for Othello: MCTS finished. Best action: ({}, {})", best_action.0, best_action.1).into());

            // Serialize the action (usize, usize) to JsValue {row: usize, col: usize}
            #[derive(Serialize)]
            struct OthelloMoveJs {
                row: usize,
                col: usize,
            }
            let othello_move_js = OthelloMoveJs { row: best_action.0, col: best_action.1 };
            serde_wasm_bindgen::to_value(&othello_move_js).map_err(|e| JsValue::from_str(&format!("Failed to serialize Othello AI move: {}", e)))
        }
    }
}

#[wasm_bindgen]
pub fn game_get_board(game_ptr: *const GameWrapper) -> JsValue {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => g.get_board(),
        GameWrapper::ConnectFour(g) => JsValue::from_str(&g.get_board_json()),
        GameWrapper::Checkers(g) => JsValue::from_str(&g.get_board_json()),
        GameWrapper::Othello(g) => {
            let board_state = othello_board_to_struct(g.get_board());
            serde_wasm_bindgen::to_value(&board_state).unwrap_or(JsValue::NULL)
        }
    }
}

#[wasm_bindgen]
pub fn game_get_status(game_ptr: *const GameWrapper) -> String {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => g.get_status(),
        GameWrapper::ConnectFour(g) => g.get_status_str(),
        GameWrapper::Checkers(g) => g.get_status_str(),
        GameWrapper::Othello(g) => {
            if g.is_game_over() {
                match g.get_winner() {
                    Some(player) => format!("Game Over. Winner: {}", othello_player_to_string(player)),
                    None => "Game Over. Draw!".to_string(),
                }
            } else {
                format!("Player {}'s turn", othello_player_to_string(g.get_current_player()))
            }
        }
    }
}

#[wasm_bindgen]
pub fn game_get_current_player(game_ptr: *const GameWrapper) -> String {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => g.get_current_player(),
        GameWrapper::ConnectFour(g) => g.get_current_player_str(),
        GameWrapper::Checkers(g) => g.get_current_player_str(),
        GameWrapper::Othello(g) => othello_player_to_string(g.get_current_player()),
    }
}

#[wasm_bindgen]
pub fn game_get_winning_line(game_ptr: *const GameWrapper) -> JsValue {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::TicTacToe(g) => g.get_winning_line(),
        GameWrapper::ConnectFour(g) => JsValue::from_str(&g.get_winning_line_json()),
        GameWrapper::Checkers(g) => JsValue::from_str(&g.get_winning_line_json()), // Will return "null"
        GameWrapper::Othello(_g) => JsValue::NULL,
    }
}

#[wasm_bindgen]
pub fn game_get_possible_moves_for_piece(game_ptr: *const GameWrapper, from_row: usize, from_col: usize) -> JsValue {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::Checkers(g) => JsValue::from_str(&g.get_possible_moves_for_piece_json(from_row, from_col)),
        GameWrapper::Othello(g) => {
            let moves = g.get_valid_moves();
            match serde_wasm_bindgen::to_value(&moves) {
                Ok(js_val) => js_val,
                Err(_) => JsValue::NULL,
            }
        }
        _ => JsValue::from_str("[]")
    }
}

#[wasm_bindgen]
pub fn game_is_in_multi_jump(game_ptr: *const GameWrapper) -> JsValue {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::Checkers(g) => JsValue::from_str(&g.game_is_in_multi_jump_json()),
        _ => JsValue::from_str("{\"active\": false}")
    }
}

fn othello_player_to_string(player: games::othello::Player) -> String {
    match player {
        games::othello::Player::Black => "Black".to_string(),
        games::othello::Player::White => "White".to_string(),
    }
}

fn othello_cell_to_struct(cell: &games::othello::Cell) -> OthelloBoardCell {
    match cell {
        games::othello::Cell::Empty => OthelloBoardCell { player: None },
        games::othello::Cell::Occupied(p) => OthelloBoardCell { player: Some(othello_player_to_string(*p)) },
    }
}

fn othello_board_to_struct(board: &[[games::othello::Cell; 8]; 8]) -> OthelloBoard {
    let mut rows = Vec::with_capacity(8);
    for r in 0..8 {
        let mut row_vec = Vec::with_capacity(8);
        for c in 0..8 {
            row_vec.push(othello_cell_to_struct(&board[r][c]));
        }
        rows.push(row_vec);
    }
    OthelloBoard { rows }
}

#[wasm_bindgen]
pub fn game_get_scores(game_ptr: *const GameWrapper) -> JsValue {
    let game = unsafe { &*game_ptr };
    match game {
        GameWrapper::Othello(g) => {
            let scores = g.get_scores();
            match serde_wasm_bindgen::to_value(&scores) {
                Ok(js_val) => js_val,
                Err(_) => JsValue::NULL,
            }
        }
        _ => JsValue::NULL,
    }
}