// Checkers game logic (to be implemented)

use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;
use crate::mcts::engine::{run as mcts_run, StopCriteria};
use crate::mcts::node::GameState;
use serde_json; // For serializing board and other structures
use serde_wasm_bindgen::from_value;
use web_sys::console; // For logging

// Represents the player
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum Player {
    Red,    // AI
    Black,  // Human
}

// Represents a piece on the board
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum PieceType {
    Man,
    King,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Piece {
    player: Player,
    piece_type: PieceType,
}

// Game status
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub enum GameStatus {
    InProgress,
    Win(Player),
    Draw, // Note: Standard checkers draw rules (e.g. 3-fold rep, 40 moves no capture/king) are not implemented here.
}

// Represents a move
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Move {
    pub from_row: usize,
    pub from_col: usize,
    pub to_row: usize,
    pub to_col: usize,
    is_capture: bool,
    captured_pos: Option<(usize, usize)>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct AiParams {
    pub time_limit_ms: Option<u64>,
    pub max_simulations: Option<u32>,
    pub uct_c: Option<f32>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct MultiJumpInfo {
    active: bool,
    row: Option<usize>,
    col: Option<usize>,
}

#[wasm_bindgen]
pub struct CheckersGame {
    board: Vec<Vec<Option<Piece>>>,
    current_player: Player,
    status: GameStatus,
    active_multi_jump_piece: Option<(usize, usize)>, // (row, col) of piece that must continue jumping
}

impl CheckersGame {
    fn get_opponent(player: Player) -> Player {
        match player {
            Player::Red => Player::Black,
            Player::Black => Player::Red,
        }
    }

    // Helper to perform move, handle capture & kinging. Returns true if a capture was made.
    fn execute_move_on_board(&mut self, mv: &Move) -> bool {
        let piece_to_move = self.board[mv.from_row][mv.from_col].expect("Piece should exist at from_pos");
        self.board[mv.to_row][mv.to_col] = Some(piece_to_move);
        self.board[mv.from_row][mv.from_col] = None;

        let mut captured = false;
        if mv.is_capture {
            if let Some((cap_r, cap_c)) = mv.captured_pos {
                self.board[cap_r][cap_c] = None;
                captured = true;
            }
        }

        // Kinging
        if let Some(piece_in_dest) = &mut self.board[mv.to_row][mv.to_col] {
            if piece_in_dest.piece_type == PieceType::Man {
                if (piece_in_dest.player == Player::Black && mv.to_row == 0) || 
                   (piece_in_dest.player == Player::Red && mv.to_row == 7) {
                    piece_in_dest.piece_type = PieceType::King;
                }
            }
        }
        captured
    }

    // Get all moves (simple and captures) for a single piece at (r, c)
    fn get_raw_moves_for_piece(&self, r: usize, c: usize) -> Vec<Move> {
        let mut moves = Vec::new();
        if let Some(piece) = self.board[r][c] {
            let directions = if piece.piece_type == PieceType::King {
                vec![(-1, -1), (-1, 1), (1, -1), (1, 1)] // King directions
            } else {
                if piece.player == Player::Black { vec![(-1, -1), (-1, 1)] } // Black's forward
                else { vec![(1, -1), (1, 1)] } // Red's forward
            };

            for (dr, dc) in directions {
                // Simple moves (to r1, c1)
                let r1 = r as i32 + dr;
                let c1 = c as i32 + dc;
                if r1 >= 0 && r1 < 8 && c1 >= 0 && c1 < 8 {
                    let r1_u = r1 as usize;
                    let c1_u = c1 as usize;
                    if self.board[r1_u][c1_u].is_none() {
                        moves.push(Move {
                            from_row: r, from_col: c, to_row: r1_u, to_col: c1_u,
                            is_capture: false, captured_pos: None,
                        });
                    }
                }

                // Capture moves (to r2, c2 jumping over r1, c1)
                let r2 = r as i32 + 2 * dr;
                let c2 = c as i32 + 2 * dc;
                if r1 >= 0 && r1 < 8 && c1 >= 0 && c1 < 8 && // Jumped square is on board
                   r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 {  // Landing square is on board
                    let r1_u = r1 as usize;
                    let c1_u = c1 as usize;
                    let r2_u = r2 as usize;
                    let c2_u = c2 as usize;

                    if let Some(jumped_piece) = self.board[r1_u][c1_u] {
                        if jumped_piece.player == Self::get_opponent(piece.player) && self.board[r2_u][c2_u].is_none() {
                            moves.push(Move {
                                from_row: r, from_col: c, to_row: r2_u, to_col: c2_u,
                                is_capture: true, captured_pos: Some((r1_u, c1_u)),
                            });
                        }
                    }
                }
            }
        }
        moves
    }
    
    // Gets all capture moves for a specific piece (used for multi-jump)
    fn get_captures_for_specific_piece(&self, r: usize, c: usize) -> Vec<Move> {
        self.get_raw_moves_for_piece(r,c).into_iter().filter(|m| m.is_capture).collect()
    }

    // Get all legal moves for a player: (captures_only_if_any, else_simple_moves)
    fn get_legal_moves_for_player(&self, player: Player) -> Vec<Move> {
        let mut all_possible_captures = Vec::new();
        let mut all_possible_simple_moves = Vec::new();

        if let Some((active_r, active_c)) = self.active_multi_jump_piece {
            // If in a multi-jump, only allow captures from that active piece
            if let Some(p) = self.board[active_r][active_c] {
                if p.player == player {
                    return self.get_captures_for_specific_piece(active_r, active_c);
                }
            }
            return Vec::new(); // Should not happen if active_multi_jump_piece is for the correct player
        }

        for r_idx in 0..8 {
            for c_idx in 0..8 {
                if let Some(piece) = self.board[r_idx][c_idx] {
                    if piece.player == player {
                        let piece_moves = self.get_raw_moves_for_piece(r_idx, c_idx);
                        for mv in piece_moves {
                            if mv.is_capture {
                                all_possible_captures.push(mv);
                            } else {
                                all_possible_simple_moves.push(mv);
                            }
                        }
                    }
                }
            }
        }

        if !all_possible_captures.is_empty() {
            // If it's a multi-jump continuation, that's already handled at the start of the function.
            // This block is for when it's not a multi-jump continuation (i.e., no specific piece must jump).
            if player == Player::Red { // AI (Red) must always take an available capture.
                all_possible_captures
            } else { // Human (Black) - initial captures are optional.
                // Combine captures and simple moves for the human player.
                all_possible_captures.extend(all_possible_simple_moves);
                all_possible_captures // This now contains the combined list
            }
        } else {
            // No captures available for anyone, return simple moves.
            all_possible_simple_moves
        }
    }

    fn update_status_after_turn_ends(&mut self) {
        let mut red_pieces = 0;
        let mut black_pieces = 0;
        for r in 0..8 {
            for c in 0..8 {
                if let Some(piece) = self.board[r][c] {
                    match piece.player {
                        Player::Red => red_pieces += 1,
                        Player::Black => black_pieces += 1,
                    }
                }
            }
        }

        if red_pieces == 0 {
            self.status = GameStatus::Win(Player::Black);
            return;
        }
        if black_pieces == 0 {
            self.status = GameStatus::Win(Player::Red);
            return;
        }

        // Check if the new current_player has any legal moves
        let next_player_moves = self.get_legal_moves_for_player(self.current_player);
        if next_player_moves.is_empty() {
            // Current player has no moves, so opponent wins
            self.status = GameStatus::Win(Self::get_opponent(self.current_player));
            // TODO: Could be a draw if opponent also has no moves, but that's rare and needs specific rules.
        }
    }

    // Internal method to apply a validated move, handle multi-jumps, switch player, and update status.
    fn apply_validated_move(&mut self, mv: &Move) {
        if self.status != GameStatus::InProgress { return; }

        let was_capture = self.execute_move_on_board(mv);
        self.active_multi_jump_piece = None; // Clear before checking for new multi-jump

        if was_capture {
            let further_captures = self.get_captures_for_specific_piece(mv.to_row, mv.to_col);
            if !further_captures.is_empty() {
                // Piece that just captured has more captures, must continue turn.
                self.active_multi_jump_piece = Some((mv.to_row, mv.to_col));
                // Player does not change, status not updated yet as turn is not over.
                return;
            }
        }
        
        // If it wasn't a capture, or was a capture but no further jumps available for that piece:
        self.current_player = Self::get_opponent(self.current_player);
        self.update_status_after_turn_ends();
    }

    // For MCTS, a deep clone is needed.
    pub fn clone_game(&self) -> Self {
        CheckersGame {
            board: self.board.clone(),
            current_player: self.current_player,
            status: self.status,
            active_multi_jump_piece: self.active_multi_jump_piece.clone(),
        }
    }

    pub fn load_state(&mut self, board_json_str: &str, current_player_str: &str, active_multi_jump_json_str: Option<&str>) -> Result<(), JsValue> {
        let board: Vec<Vec<Option<Piece>>> = serde_json::from_str(board_json_str)
            .map_err(|e| JsValue::from_str(&format!("Failed to deserialize board: {}", e)))?;
        
        if board.len() != 8 || board.iter().any(|row| row.len() != 8) {
            return Err(JsValue::from_str("Board dimensions must be 8x8."));
        }
        self.board = board;

        self.current_player = match current_player_str {
            "Red" => Player::Red,
            "Black" => Player::Black,
            _ => return Err(JsValue::from_str(&format!("Invalid current player string: {}", current_player_str))),
        };

        if let Some(json_str) = active_multi_jump_json_str {
            let multi_jump_info: MultiJumpInfo = serde_json::from_str(json_str)
                .map_err(|e| JsValue::from_str(&format!("Failed to deserialize active_multi_jump_info: {}", e)))?;
            if multi_jump_info.active && multi_jump_info.row.is_some() && multi_jump_info.col.is_some() {
                self.active_multi_jump_piece = Some((multi_jump_info.row.unwrap(), multi_jump_info.col.unwrap()));
            } else {
                self.active_multi_jump_piece = None;
            }
        } else {
            self.active_multi_jump_piece = None;
        }

        // Re-evaluate status based on the loaded state.
        // It might be complex to perfectly restore mid-game status without more info (e.g. move count for draw rules)
        // For now, check for immediate win/loss based on pieces and if current player has moves.
        // If no immediate terminal state, assume InProgress.
        self.status = GameStatus::InProgress; // Default
        self.update_status_after_turn_ends(); // This checks for wins/stalemates for the *new* current player
        
        // update_status_after_turn_ends assumes the turn has just ended for the *previous* player.
        // If we are loading a state where it IS current_player_str's turn, 
        // we might need to adjust how status is checked or who it's checked for.
        // For now, this will check if the loaded current_player has any moves. If not, they lose.
        Ok(())
    }
}

impl Clone for CheckersGame {
    fn clone(&self) -> Self {
        self.clone_game()
    }
}

impl GameState for CheckersGame {
    type Action = Move;
    const NUM_PLAYERS: usize = 2;

    fn current_player(&self) -> usize {
        match self.current_player {
            Player::Red => 0,   // AI
            Player::Black => 1, // Human
        }
    }

    fn legal_actions(&self) -> Vec<Self::Action> {
        if self.is_terminal() {
            return Vec::new();
        }
        self.get_legal_moves_for_player(self.current_player)
    }

    fn apply_action(&self, action: &Self::Action) -> Self {
        let mut new_state = self.clone(); // Uses the Clone trait
        
        // Perform the move. apply_validated_move modifies state in place.
        // It handles piece movement, capture, kinging, multi-jump setup, player switching, and status update.
        new_state.apply_validated_move(action);
        
        // If apply_validated_move decided it's still the same player's turn (due to multi-jump),
        // current_player is already correct. If it switched, it's also correct.
        // Status is also updated by apply_validated_move.
        new_state
    }

    fn is_terminal(&self) -> bool {
        self.status != GameStatus::InProgress
    }

    fn reward_vec(&self) -> Vec<f32> {
        let mut rewards = vec![0.0; Self::NUM_PLAYERS]; // [Red, Black]
        match self.status {
            GameStatus::Win(Player::Red) => rewards[0] = 1.0,
            GameStatus::Win(Player::Black) => rewards[1] = 1.0,
            GameStatus::Draw => {
                rewards[0] = 0.5;
                rewards[1] = 0.5;
            }
            GameStatus::InProgress => {
                // This shouldn't ideally be called if is_terminal() is false,
                // but MCTS might call it on non-terminal for rollouts.
                // For now, let's return 0 for in-progress. More complex heuristics could go here.
            }
        }
        rewards
    }
}

#[wasm_bindgen]
impl CheckersGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        let mut board = vec![vec![None; 8]; 8];
        for r in 0..3 {
            for c in 0..8 {
                if (r + c) % 2 == 1 { 
                    board[r][c] = Some(Piece { player: Player::Red, piece_type: PieceType::Man });
                }
            }
        }
        for r in 5..8 {
            for c in 0..8 {
                if (r + c) % 2 == 1 { 
                    board[r][c] = Some(Piece { player: Player::Black, piece_type: PieceType::Man });
                }
            }
        }
        CheckersGame {
            board,
            current_player: Player::Black, // Black (human) starts
            status: GameStatus::InProgress,
            active_multi_jump_piece: None,
        }
    }

    // Accepts a JsValue that is expected to be a serialized Move struct
    pub fn make_player_move(&mut self, move_val: JsValue) -> Result<(), JsValue> {
        let player_move: Move = from_value(move_val)
            .map_err(|e| JsValue::from_str(&format!("Invalid move_val: {}", e)))?;

        if self.status != GameStatus::InProgress {
            return Err(JsValue::from_str(&format!("Game is over: {:?}", self.status)));
        }

        let legal_moves = self.get_legal_moves_for_player(self.current_player);
        if !legal_moves.contains(&player_move) {
            // console::log_1(&format!("Illegal move attempted by {:?}: {:?}", self.current_player, player_move).into());
            // console::log_1(&format!("Legal moves: {:?}", legal_moves).into());
            return Err(JsValue::from_str("Illegal move"));
        }

        self.apply_validated_move(&player_move);
        Ok(())
    }

    pub fn ai_move(&mut self, params_js: JsValue) -> Result<JsValue, JsValue> {
        if self.status != GameStatus::InProgress {
            return Err(JsValue::from_str(&format!("Game is over: {:?}", self.status)));
        }
        if self.current_player != Player::Red { // Assuming AI is always Red
            return Err(JsValue::from_str("Not AI's turn (AI is Red)"));
        }

        let params: AiParams = from_value(params_js)
            .map_err(|e| JsValue::from_str(&format!("Invalid AI params: {}", e)))?;

        // console::log_1(&format!("Checkers AI ({:?}) thinking with params: {:?}...", self.current_player, params).into());

        let stop_criteria = if let Some(time_limit_ms) = params.time_limit_ms {
            StopCriteria::Time(std::time::Duration::from_millis(time_limit_ms))
        } else if let Some(max_simulations) = params.max_simulations {
            StopCriteria::Simulations(max_simulations)
        } else {
            StopCriteria::Simulations(1000) 
        };
        
        let uct_c_param = params.uct_c; 

        let mcts_game_state = self.clone(); 

        let best_move = mcts_run(&mcts_game_state, stop_criteria, uct_c_param);

        // console::log_1(&format!("AI ({:?}) chose move: {:?}", self.current_player, best_move).into());
        
        let legal_moves_on_current_state = self.get_legal_moves_for_player(self.current_player);
        if !legal_moves_on_current_state.contains(&best_move) {
            console::error_1(&format!("MCTS returned an illegal move for the current board state! Move: {:?}", best_move).into());
            console::error_1(&format!("Legal moves available: {:?}", legal_moves_on_current_state).into());
            let board_json = self.get_board_json();
            console::error_1(&format!("Current board state: {}", board_json).into());
            return Err(JsValue::from_str("MCTS returned illegal move for current state."));
        }

        self.apply_validated_move(&best_move);
        
        serde_wasm_bindgen::to_value(&best_move)
            .map_err(|e| JsValue::from_str(&format!("Failed to serialize AI move: {}", e)))
    }

    pub fn get_board_json(&self) -> String {
        serde_json::to_string(&self.board).unwrap_or_else(|_| "[]".to_string())
    }

    pub fn get_status_str(&self) -> String {
        match self.status {
            GameStatus::InProgress => "InProgress".to_string(),
            GameStatus::Win(Player::Red) => "WinRed".to_string(),
            GameStatus::Win(Player::Black) => "WinBlack".to_string(),
            GameStatus::Draw => "Draw".to_string(),
        }
    }

    pub fn get_current_player_str(&self) -> String {
        match self.current_player {
            Player::Red => "red".to_string(),
            Player::Black => "black".to_string(),
        }
    }

    pub fn get_winning_line_json(&self) -> String {
        "null".to_string() // Checkers doesn't have a single winning line typically highlighted.
    }
    
    pub fn get_possible_moves_for_piece_json(&self, from_row: usize, from_col: usize) -> String {
        if self.status != GameStatus::InProgress {
            return "[]".to_string();
        }

        let mut moves_to_return: Vec<Move> = Vec::new();

        // First, ensure the piece at (from_row, from_col) belongs to the current player.
        // If not, it can never have moves displayed for the current turn.
        match self.board[from_row][from_col] {
            Some(piece) if piece.player == self.current_player => {
                // Piece belongs to current player. Now determine what moves it has.
                if let Some((active_r, active_c)) = self.active_multi_jump_piece {
                    // CASE 1: A multi-jump sequence is active for a specific piece.
                    // Only that piece can move, and it must make a capture.
                    if active_r == from_row && active_c == from_col {
                        moves_to_return = self.get_captures_for_specific_piece(active_r, active_c);
                    }
                    // If (from_row, from_col) is not the active multi-jump piece, it gets no moves.
                } else {
                    // CASE 2: No specific multi-jump sequence is active.
                    // We need to get all legal moves for the current player.
                    // get_legal_moves_for_player() already correctly enforces general forced captures
                    // (i.e., returns only captures if any exist, otherwise simple moves).
                    let all_legal_moves_for_player = self.get_legal_moves_for_player(self.current_player);
                    
                    // Filter these legal moves to get only those originating from the selected (from_row, from_col).
                    moves_to_return = all_legal_moves_for_player.into_iter()
                        .filter(|m| m.from_row == from_row && m.from_col == from_col)
                        .collect();
                }
            }
            _ => { 
                // No piece at (from_row, from_col) or piece does not belong to current player.
                // No moves to return in this case.
            }
        }
            
        serde_json::to_string(&moves_to_return).unwrap_or_else(|_| "[]".to_string())
    }

    #[wasm_bindgen]
    pub fn game_is_in_multi_jump_json(&self) -> String {
        if let Some((r, c)) = self.active_multi_jump_piece {
            if let Some(piece) = self.board[r][c] {
                if piece.player == self.current_player {
                    return serde_json::to_string(&MultiJumpInfo { active: true, row: Some(r), col: Some(c) })
                           .unwrap_or_else(|_| "{\"active\": false}".to_string());
                }
            }
        }
        serde_json::to_string(&MultiJumpInfo { active: false, row: None, col: None })
            .unwrap_or_else(|_| "{\"active\": false}".to_string())
    }
}

// Stubs for MCTSNode trait (conceptual, as full MCTS is not implemented here)
// This is commented out in the previous version due to MCTS crate/module issues.
// If MCTS were to be used, it would need these kinds of methods.
/* 
impl MCTSNode for CheckersGame { ... } // Needs to be adapted to new Move struct & logic
*/

// Simplified clone_game, evaluate_state, get_legal_moves (usize encoded) used by prior commented MCTS stubs
// These would need to be fully implemented or removed if MCTS is not pursued with this structure.
impl CheckersGame {
    // Example evaluation (used by commented MCTS)
    pub fn evaluate_state(&self, _player_perspective: Player) -> f64 {
        match self.status {
            GameStatus::Win(p) => if p == self.current_player { 1.0 } else { -1.0 }, // Simplified: perspective of current_player at node
            GameStatus::Draw => 0.0,
            GameStatus::InProgress => 0.1, // Small bias for non-terminal, or more complex eval
        }
    }
    
    // Returns a list of all valid moves for the current player, encoded as usize (used by commented MCTS)
    pub fn get_legal_moves_encoded(&self) -> Vec<usize> {
        self.get_legal_moves_for_player(self.current_player)
            .iter()
            .map(|mv| (mv.from_row * 8 + mv.from_col) << 6 | (mv.to_row * 8 + mv.to_col))
            .collect()
    }
} 