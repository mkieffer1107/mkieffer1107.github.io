// Connect Four game logic

use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;
use crate::mcts::node::GameState;
use crate::mcts::engine::{run as run_mcts, StopCriteria};
use web_sys::console; // For logging
use web_time::Duration;

const ROWS: usize = 6;
const COLS: usize = 7;

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq, Debug)]
pub enum Piece {
    Red,
    Yellow,
    None,
}

impl Piece {
    fn next(&self) -> Piece {
        match self {
            Piece::Red => Piece::Yellow,
            Piece::Yellow => Piece::Red,
            Piece::None => Piece::None,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct WinningCell {
    row: usize,
    col: usize,
}

// AiParams struct defined before its use in ConnectFourGame impl
#[derive(Deserialize, Debug, Clone)]
pub struct AiParams {
    pub time_limit_ms: Option<u32>,
    pub max_simulations: Option<u32>,
    pub uct_c: Option<f64>,
}

#[wasm_bindgen]
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ConnectFourGame {
    board: [[Piece; COLS]; ROWS],
    current_player_piece: Piece,
    winner: Option<Piece>,
    winning_line: Option<Vec<WinningCell>>,
    is_draw: bool,
}

#[wasm_bindgen]
impl ConnectFourGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        ConnectFourGame {
            board: [[Piece::None; COLS]; ROWS],
            current_player_piece: Piece::Red,
            winner: None,
            winning_line: None,
            is_draw: false,
        }
    }

    pub fn load_state(&mut self, board_json_str: &str, current_player_str: &str) -> Result<(), JsValue> {
        let board: [[Piece; COLS]; ROWS] = serde_json::from_str(board_json_str)
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize ConnectFour board: {}", e)))?;
        // Basic validation, though serde might catch array size mismatches if types are strict.
        if board.len() != ROWS || board.iter().any(|row| row.len() != COLS) {
            return Err(JsValue::from_str("Board dimensions mismatch."));
        }
        self.board = board;

        self.current_player_piece = match current_player_str {
            "Red" | "red" => Piece::Red,
            "Yellow" | "yellow" => Piece::Yellow,
            _ => return Err(JsValue::from_str(&format!("Invalid current player string for Connect Four: {}", current_player_str))),
        };
        
        // Reset and re-evaluate winner/draw status
        self.winner = None;
        self.winning_line = None;
        self.is_draw = false;

        // It's tricky to determine the last move to call check_game_over precisely.
        // A full board scan for win/draw conditions is safer after loading arbitrary state.
        self.scan_board_for_win_or_draw();

        Ok(())
    }

    // New helper method to scan the entire board for win/draw conditions.
    fn scan_board_for_win_or_draw(&mut self) {
        // Check for a winner by iterating through all possible winning lines
        // This is more robust for an arbitrary loaded state than relying on a single last move.
        for r in 0..ROWS {
            for c in 0..COLS {
                if self.board[r][c] != Piece::None {
                    // Temporarily set self.winner and self.winning_line if a win is found by check_game_over
                    // check_game_over needs the last piece placed to check efficiently.
                    // To use it here, we'd simulate checking from each piece.
                    // A more direct scan might be better:
                    if self.check_win_at(r, c, self.board[r][c]) {
                        return; // self.winner and self.winning_line are set by check_win_at
                    }
                }
            }
        }

        // If no winner, check for draw (board full)
        if self.winner.is_none() && self.board[0].iter().all(|&cell| cell != Piece::None) {
            self.is_draw = true;
        }
    }

    // Helper for scan_board_for_win_or_draw, checks for win starting from (r,c) for piece p
    // Sets self.winner and self.winning_line if win found.
    fn check_win_at(&mut self, r_start: usize, c_start: usize, piece: Piece) -> bool {
        if piece == Piece::None { return false; }

        let directions = [(0, 1), (1, 0), (1, 1), (1, -1)]; // H, V, Diag \, Diag /

        for (dr, dc) in directions.iter() {
            let mut count = 0;
            let mut line_coords = Vec::new();
            for i in 0..4 {
                let r = r_start as i32 + i * (*dr as i32);
                let c = c_start as i32 + i * (*dc as i32);

                if r >= 0 && r < ROWS as i32 && c >= 0 && c < COLS as i32 {
                    if self.board[r as usize][c as usize] == piece {
                        count += 1;
                        line_coords.push(WinningCell {row: r as usize, col: c as usize});
                    } else {
                        break; // Streak broken
                    }
                } else {
                    break; // Out of bounds
                }
            }
            if count == 4 {
                self.winner = Some(piece);
                self.winning_line = Some(line_coords);
                return true;
            }
        }
        false
    }

    fn is_valid_move(&self, col: usize) -> bool {
        col < COLS && self.board[0][col] == Piece::None
    }

    // Internal helper: Tries to place a piece, mutates board, updates winner/draw.
    // Returns Some(placed_row) if successful, None otherwise.
    fn place_piece_and_update_status(&mut self, col: usize, piece: Piece) -> Option<usize> {
        if col >= COLS || self.board[0][col] != Piece::None {
            return None; // Invalid move: out of bounds or column full
        }

        for r in (0..ROWS).rev() {
            if self.board[r][col] == Piece::None {
                self.board[r][col] = piece;
                self.check_game_over(r, col); // This updates self.winner, self.is_draw
                return Some(r);
            }
        }
        None // Should not be reached if is_valid_move was true initially
    }

    // Internal helper: Checks for game over conditions.
    fn check_game_over(&mut self, last_row: usize, last_col: usize) {
        let player_piece = self.board[last_row][last_col];
        if player_piece == Piece::None { return; }

        let directions = [(0, 1), (1, 0), (1, 1), (1, -1)]; // H, V, Diag\\, Diag/
        for (dr, dc) in directions {
            let mut line = Vec::new();
            for i in -3..=3 {
                let r = last_row as i32 + i * dr;
                let c = last_col as i32 + i * dc;
                if r >= 0 && r < ROWS as i32 && c >= 0 && c < COLS as i32 {
                    if self.board[r as usize][c as usize] == player_piece {
                        line.push(WinningCell { row: r as usize, col: c as usize });
                        if line.len() >= 4 {
                            // Check for 4 consecutive in any direction around (last_row, last_col)
                            let rows = ROWS as i32;
                            let cols = COLS as i32;
                            let lr = last_row as i32;
                            let lc = last_col as i32;

                            for (dx, dy) in &[(0,1), (1,0), (1,1), (1,-1)] { // H, V, Diag\\, Diag/
                                let mut count = 1;
                                let mut current_win_line = vec![WinningCell{row: lr as usize, col: lc as usize}];
                                // Check one direction
                                for i in 1..4 {
                                    let r = lr + dy * i;
                                    let c = lc + dx * i;
                                    if r >= 0 && r < rows && c >= 0 && c < cols && self.board[r as usize][c as usize] == player_piece {
                                        count += 1;
                                        current_win_line.push(WinningCell{row: r as usize, col: c as usize});
                                    } else { break; }
                                }
                                // Check opposite direction
                                for i in 1..4 {
                                    let r = lr - dy * i;
                                    let c = lc - dx * i;
                                     if r >= 0 && r < rows && c >= 0 && c < cols && self.board[r as usize][c as usize] == player_piece {
                                        count += 1;
                                        current_win_line.push(WinningCell{row: r as usize, col: c as usize});
                                    } else { break; }
                                }
                                if count >= 4 {
                                    self.winner = Some(player_piece);
                                    // Sort and truncate to the actual 4 winning cells if more are found due to search logic.
                                    current_win_line.sort_by(|a,b| if a.row != b.row {a.row.cmp(&b.row)} else {a.col.cmp(&b.col)});
                                    // This winning_line logic might still need refinement to ensure it picks the *correct* 4.
                                    // For now, if count >=4, we set the winner and the found line.
                                    self.winning_line = Some(current_win_line); 
                                    return;
                                }
                            }
                        }
                    } else { // Piece doesn't match, reset current line segment
                        // line.clear(); // If checking for strict consecutive: reset
                    }
                } else { // Out of bounds, reset current line segment
                    // line.clear(); // If checking for strict consecutive: reset
                }
            }
        }

        if self.winner.is_none() && self.board[0].iter().all(|&cell| cell != Piece::None) {
            self.is_draw = true;
        }
    }

    // --- Public WASM interface ---
    #[wasm_bindgen(js_name = getBoardJson)]
    pub fn get_board_json(&self) -> String {
        serde_json::to_string(&self.board).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = getCurrentPlayerStr)]
    pub fn get_current_player_str(&self) -> String {
        match self.current_player_piece {
            Piece::Red => "red".to_string(),
            Piece::Yellow => "yellow".to_string(),
            Piece::None => "none".to_string(),
        }
    }
    
    #[wasm_bindgen(js_name = getStatusStr)]
    pub fn get_status_str(&self) -> String {
        if let Some(winner) = self.winner {
            return match winner {
                Piece::Red => "WinRed".to_string(),
                Piece::Yellow => "WinYellow".to_string(),
                Piece::None => "Error: Winner is None Piece".to_string(),
            };
        }
        if self.is_draw {
            return "Draw".to_string();
        }
        "InProgress".to_string()
    }
    
    #[wasm_bindgen(js_name = getWinningLineJson)]
    pub fn get_winning_line_json(&self) -> String {
        serde_json::to_string(&self.winning_line).unwrap_or_else(|_| "null".to_string())
    }

    #[wasm_bindgen(js_name = makePlayerMove)]
    pub fn make_player_move(&mut self, col: usize) -> Result<(), JsValue> {
        if self.winner.is_some() || self.is_draw {
            return Err(JsValue::from_str("Game is over."));
        }
        if !self.is_valid_move(col) {
            return Err(JsValue::from_str(&format!("Invalid move: column {} is full or out of bounds.", col)));
        }
        
        let piece_to_play = self.current_player_piece;
        if self.place_piece_and_update_status(col, piece_to_play).is_some() {
            if self.winner.is_none() && !self.is_draw {
                self.current_player_piece = self.current_player_piece.next();
            }
            Ok(())
        } else {
            Err(JsValue::from_str(&format!("Failed to place piece in column {}.", col)))
        }
    }

    #[wasm_bindgen(js_name = aiMove)]
    pub fn ai_move(&mut self, params: JsValue) -> Result<JsValue, JsValue> {
        if self.winner.is_some() || self.is_draw {
            return Err(JsValue::from_str("Game is already over. Cannot make AI move."));
        }

        let ai_params: AiParams = serde_wasm_bindgen::from_value(params)
            .map_err(|e| JsValue::from_str(&format!("Invalid AI params: {}", e)))?;

        let stop_criteria = if let Some(time_limit) = ai_params.time_limit_ms {
            StopCriteria::Time(Duration::from_millis(time_limit as u64))
        } else if let Some(sim_count) = ai_params.max_simulations {
            StopCriteria::Simulations(sim_count)
        } else {
            StopCriteria::Simulations(1000)
        };
        
        let mcts_root_state = self.clone(); // MCTS operates on a clone
        
        let best_action_col = run_mcts(
            &mcts_root_state, 
            stop_criteria, 
            ai_params.uct_c.map(|c| c as f32)
        );

        // Apply the AI's chosen move (column) to the current game state
        let ai_piece_to_play = self.current_player_piece;
        if self.place_piece_and_update_status(best_action_col, ai_piece_to_play).is_some() {
            if self.winner.is_none() && !self.is_draw {
                self.current_player_piece = self.current_player_piece.next();
            }
            serde_wasm_bindgen::to_value(&best_action_col)
                .map_err(|e| JsValue::from_str(&format!("Failed to serialize AI move (column {}): {}", best_action_col, e)))
        } else {
            console::error_1(&format!("[ai_move] MCTS chose column {}, but it was invalid or failed to place.", best_action_col).into());
            Err(JsValue::from_str(&format!("[ai_move] MCTS chose column {}, but it was invalid or failed to place.", best_action_col)))
        }
    }
}

impl GameState for ConnectFourGame {
    type Action = usize; // Action is the column index
    const NUM_PLAYERS: usize = 2;

    fn legal_actions(&self) -> Vec<Self::Action> {
        if self.winner.is_some() || self.is_draw {
            return Vec::new();
        }
        (0..COLS).filter(|&col| self.is_valid_move(col)).collect()
    }

    fn apply_action(&self, action_col: &Self::Action) -> Self {
        let mut new_state = self.clone();
        if new_state.place_piece_and_update_status(*action_col, self.current_player_piece).is_some() {
            if new_state.winner.is_none() && !new_state.is_draw {
                new_state.current_player_piece = new_state.current_player_piece.next();
            }
        } else {
            console::error_1(&format!("[GameState::apply_action] MCTS chose invalid column {} for state: {:?}", action_col, self).into());
        }
        new_state
    }

    fn is_terminal(&self) -> bool {
        self.winner.is_some() || self.is_draw
    }

    fn reward_vec(&self) -> Vec<f32> {
        let mut rewards = vec![0.0; Self::NUM_PLAYERS];
        if let Some(winner_piece) = self.winner {
            match winner_piece {
                Piece::Red => rewards[0] = 1.0,
                Piece::Yellow => rewards[1] = 1.0,
                Piece::None => {}
            }
        } else if self.is_draw {
            rewards[0] = 0.5;
            rewards[1] = 0.5;
        }
        rewards
    }

    fn current_player(&self) -> usize {
        match self.current_player_piece {
            Piece::Red => 0,
            Piece::Yellow => 1,
            Piece::None => panic!("Invalid game state: No current player for MCTS"),
        }
    }
} 