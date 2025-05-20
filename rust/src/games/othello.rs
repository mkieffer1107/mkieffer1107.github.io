use std::fmt;
use serde::{Deserialize, Serialize};
use crate::mcts::node::GameState;
// use web_sys::console;

#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize, Eq, Hash)]
pub enum Player {
    Black,
    White,
}

impl Player {
    pub fn opponent(&self) -> Player {
        match self {
            Player::Black => Player::White,
            Player::White => Player::Black,
        }
    }
}

#[derive(Clone, Copy, PartialEq, Debug, Serialize, Deserialize)]
pub enum Cell {
    Empty,
    Occupied(Player),
}

// Helper structs for deserializing the board state moved to module scope
#[derive(Deserialize)]
struct OthelloCellForLoad {
    player: Option<String>, // "Black", "White", or null
}

#[derive(Deserialize)]
struct OthelloBoardForLoad {
    rows: Vec<Vec<OthelloCellForLoad>>,
}

#[derive(Clone, Debug)]
pub struct Othello {
    board: [[Cell; 8]; 8],
    current_player: Player,
    game_over: bool,
    winner: Option<Player>,
    black_score: u8,
    white_score: u8,
}

impl Othello {
    pub fn new() -> Self {
        // web_sys::console::log_1(&"Othello new() called".into());
        let mut board = [[Cell::Empty; 8]; 8];
        board[3][3] = Cell::Occupied(Player::White);
        board[3][4] = Cell::Occupied(Player::Black);
        board[4][3] = Cell::Occupied(Player::Black);
        board[4][4] = Cell::Occupied(Player::White);
        Othello {
            board,
            current_player: Player::Black,
            game_over: false,
            winner: None,
            black_score: 2,
            white_score: 2,
        }
    }

    pub fn get_board(&self) -> &[[Cell; 8]; 8] {
        &self.board
    }

    pub fn get_current_player(&self) -> Player {
        self.current_player
    }

    pub fn is_game_over(&self) -> bool {
        self.game_over
    }

    pub fn get_winner(&self) -> Option<Player> {
        self.winner
    }

    pub fn get_scores(&self) -> (u8, u8) {
        (self.black_score, self.white_score)
    }

    fn is_valid_coord(row: i8, col: i8) -> bool {
        row >= 0 && row < 8 && col >= 0 && col < 8
    }

    pub fn get_valid_moves(&self) -> Vec<(usize, usize)> {
        // web_sys::console::log_1(&"Othello get_valid_moves() entry".into());
        let mut moves = Vec::new();
        if self.game_over {
            return moves;
        }
        for r in 0..8 {
            for c in 0..8 {
                if self.is_valid_move(r, c) {
                    moves.push((r, c));
                }
            }
        }
        moves
    }
    
    fn pieces_to_flip(&self, row: usize, col: usize, player: Player) -> Vec<(usize, usize)> {
        let mut to_flip = Vec::new();
        if self.board[row][col] != Cell::Empty {
            return to_flip;
        }

        let opponent = player.opponent();
        let directions = [
            (-1, -1), (-1, 0), (-1, 1),
            (0, -1),           (0, 1),
            (1, -1), (1, 0), (1, 1),
        ];

        for (dr, dc) in directions.iter() {
            let mut current_flips = Vec::new();
            let mut r = row as i8 + dr;
            let mut c = col as i8 + dc;

            if !Self::is_valid_coord(r, c) || self.board[r as usize][c as usize] != Cell::Occupied(opponent) {
                continue;
            }
            current_flips.push((r as usize, c as usize));

            loop {
                r += dr;
                c += dc;
                if !Self::is_valid_coord(r, c) {
                    current_flips.clear();
                    break;
                }
                match self.board[r as usize][c as usize] {
                    Cell::Occupied(p) if p == opponent => {
                        current_flips.push((r as usize, c as usize));
                    }
                    Cell::Occupied(p) if p == player => {
                        to_flip.extend(current_flips);
                        break;
                    }
                    _ => { // Empty or out of bounds
                        current_flips.clear();
                        break;
                    }
                }
            }
        }
        to_flip
    }

    pub fn is_valid_move(&self, row: usize, col: usize) -> bool {
        !self.pieces_to_flip(row, col, self.current_player).is_empty()
    }

    pub fn make_move(&mut self, row: usize, col: usize) -> Result<(), String> {
        // let player_str = if self.current_player == Player::Black { "Black" } else { "White" };
        // console::log_1(&format!("[Rust Othello] make_move entry: player {}, move ({}, {})", player_str, row, col).into());
        // web_sys::console::log_1(&format!("Othello make_move entry. Player: {:?}, Move: ({}, {})", self.current_player, row, col).into());

        if self.game_over {
            let err_msg = "Game is over".to_string();
            // web_sys::console::log_1(&format!("Othello make_move error: {}", err_msg).into());
            return Err(err_msg);
        }
        if !self.is_valid_move(row, col) {
            return Err(format!("Invalid move at ({}, {})", row, col));
        }

        let pieces_to_flip = self.pieces_to_flip(row, col, self.current_player);
        
        self.board[row][col] = Cell::Occupied(self.current_player);
        for (r, c) in pieces_to_flip {
            self.board[r][c] = Cell::Occupied(self.current_player);
        }
        
        self.update_scores();
        self.current_player = self.current_player.opponent();

        if self.get_valid_moves().is_empty() {
            // Opponent has no moves, pass turn back
            self.current_player = self.current_player.opponent();
            if self.get_valid_moves().is_empty() {
                // Neither player has moves, game over
                self.end_game();
            }
        }
        // web_sys::console::log_1(&"Othello make_move end".into());
        Ok(())
    }

    fn update_scores(&mut self) {
        // web_sys::console::log_1(&"Othello update_scores() entry".into());
        self.black_score = 0;
        self.white_score = 0;
        for r in 0..8 {
            for c in 0..8 {
                match self.board[r][c] {
                    Cell::Occupied(Player::Black) => self.black_score += 1,
                    Cell::Occupied(Player::White) => self.white_score += 1,
                    _ => {}
                }
            }
        }
    }
    
    fn end_game(&mut self) {
        self.game_over = true;
        if self.black_score > self.white_score {
            self.winner = Some(Player::Black);
        } else if self.white_score > self.black_score {
            self.winner = Some(Player::White);
        } else {
            self.winner = None; // Draw
        }
    }

    pub fn load_state(&mut self, board_json_str: &str, current_player_str: &str) -> Result<(), String> {
        // console::log_1(&format!("[Rust Othello] load_state entry. Player: {}, Board: {}", current_player_str, board_json_str).into());
        // web_sys::console::log_1(&format!("Othello load_state entry. Player: {}, Board: {}", current_player_str, board_json_str).into());

        let board_data: OthelloBoardForLoad = serde_json::from_str(board_json_str)
            .map_err(|e| format!("Failed to deserialize board JSON: {}", e))?;

        if board_data.rows.len() != 8 {
            return Err(format!("Invalid board row count: expected 8, got {}", board_data.rows.len()));
        }

        for r in 0..8 {
            if board_data.rows[r].len() != 8 {
                return Err(format!("Invalid board column count for row {}: expected 8, got {}", r, board_data.rows[r].len()));
            }
            for c in 0..8 {
                self.board[r][c] = match board_data.rows[r][c].player.as_deref() {
                    Some("Black") => Cell::Occupied(Player::Black),
                    Some("White") => Cell::Occupied(Player::White),
                    None => Cell::Empty,
                    Some(other) => return Err(format!("Invalid player string '{}' in board data at ({},{})", other, r, c)),
                };
            }
        }

        self.current_player = match current_player_str {
            "Black" => Player::Black,
            "White" => Player::White,
            _ => return Err(format!("Invalid current player string: {}", current_player_str)),
        };

        self.update_scores(); // Recalculate scores based on loaded board
        
        // Check if game is over after loading state (e.g. no valid moves for current player)
        if self.get_valid_moves().is_empty() {
            let opponent_has_moves = {
                self.current_player = self.current_player.opponent(); // Temporarily switch to check opponent
                let moves = self.get_valid_moves();
                self.current_player = self.current_player.opponent(); // Switch back
                !moves.is_empty()
            };

            if !opponent_has_moves { // Neither player has moves
                self.end_game();
            } else {
                 self.game_over = false;
                 self.winner = None;
            }
        } else {
            self.game_over = false;
            self.winner = None;
        }

        // web_sys::console::log_1(&format!("Othello load_state end. Game Over: {}, Winner: {:?}", self.game_over, self.winner).into());
        Ok(())
    }

    // Basic AI: picks the first valid move
    // This is a placeholder and should be replaced by MCTS integration
    pub fn ai_move_simple(&mut self) -> Result<(usize, usize), String> {
        // web_sys::console::log_1(&"Othello ai_move_simple() entry".into());
        let valid_moves = self.get_valid_moves();
        if valid_moves.is_empty() {
            // web_sys::console::log_1(&"Othello ai_move_simple: No valid moves for AI.".into());
            return Err("No valid moves for AI".to_string());
        }
        let chosen_move = valid_moves[0];
        // web_sys::console::log_1(&format!("Othello ai_move_simple: Chose move ({}, {}). Making move...", chosen_move.0, chosen_move.1).into());
        // self.make_move(chosen_move.0, chosen_move.1)?; // AI move should not change its own state, MCTS engine does that.
        // web_sys::console::log_1(&"Othello ai_move_simple end".into());
        Ok(chosen_move)
    }
}

impl fmt::Display for Othello {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        writeln!(f, "Current Player: {:?}", self.current_player)?;
        writeln!(f, "Scores: Black {}, White {}", self.black_score, self.white_score)?;
        if self.game_over {
            writeln!(f, "Game Over! Winner: {:?}", self.winner)?;
        }
        for r in 0..8 {
            for c in 0..8 {
                let token = match self.board[r][c] {
                    Cell::Empty => ".",
                    Cell::Occupied(Player::Black) => "B",
                    Cell::Occupied(Player::White) => "W",
                };
                write!(f, "{} ", token)?;
            }
            writeln!(f)?;
        }
        Ok(())
    }
}

// Add wasm_bindgen attributes later

// MCTS GameState Implementation for Othello
impl GameState for Othello {
    type Action = (usize, usize); // row, col
    const NUM_PLAYERS: usize = 2;

    fn legal_actions(&self) -> Vec<Self::Action> {
        self.get_valid_moves()
    }

    fn apply_action(&self, action: &Self::Action) -> Self {
        let mut new_state = self.clone();
        match new_state.make_move(action.0, action.1) {
            Ok(_) => (),
            Err(e) => {
                // This should ideally not happen if actions are correctly sourced from legal_actions
                // and game logic is sound. Panicking here might be too severe for MCTS,
                // but returning the unmodified state or a specific error state could be options.
                // For now, log and return state, MCTS might penalize this path.
                // console::log_1(&format!("[Rust Othello MCTS] apply_action failed: {}. Returning unchaged state.", e).into());
                // haha awesome vibe coded comment
            }
        }
        new_state
    }

    fn is_terminal(&self) -> bool {
        self.is_game_over()
    }

    fn reward_vec(&self) -> Vec<f32> {
        if !self.is_terminal() {
            return vec![0.0, 0.0]; // No reward if game is not over
        }
        match self.winner {
            Some(Player::Black) => vec![1.0, -1.0], // Player 0 (Black) wins
            Some(Player::White) => vec![-1.0, 1.0], // Player 1 (White) wins
            None => vec![0.5, 0.5], // Draw
        }
    }

    fn current_player(&self) -> usize {
        match self.current_player {
            Player::Black => 0,
            Player::White => 1,
        }
    }
}
