// rust/src/games/tic_tac_toe.rs
use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;
use serde_wasm_bindgen::{to_value, from_value};
use crate::mcts::engine::{run as mcts_run, StopCriteria};
use crate::mcts::node::GameState;
use std::time::Duration;

#[derive(Serialize, Deserialize, Copy, Clone, Debug, PartialEq, Eq, Hash)]
pub enum Player {
    X,
    O,
}

impl Player {
    fn opponent(&self) -> Player {
        match self {
            Player::X => Player::O,
            Player::O => Player::X,
        }
    }

    fn to_index(&self) -> usize {
        match self {
            Player::X => 0,
            Player::O => 1,
        }
    }
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, Eq, Hash)]
pub struct TicTacToeState {
    pub board: [Option<Player>; 9],
    pub to_move: Player,
}

#[derive(Serialize, Deserialize, Clone, Debug, Copy, PartialEq, Eq, Hash)]
pub struct TicTacToeAction {
    pub index: usize,
}

impl GameState for TicTacToeState {
    type Action = TicTacToeAction;
    const NUM_PLAYERS: usize = 2;

    fn legal_actions(&self) -> Vec<Self::Action> {
        if self.is_terminal() {
            return Vec::new();
        }
        self.board.iter().enumerate()
            .filter(|(_, cell)| cell.is_none())
            .map(|(i, _)| TicTacToeAction { index: i })
            .collect()
    }

    fn apply_action(&self, action: &Self::Action) -> Self {
        let mut new_board = self.board.clone();
        new_board[action.index] = Some(self.to_move.clone());
        TicTacToeState {
            board: new_board,
            to_move: self.to_move.opponent(),
        }
    }

    fn is_terminal(&self) -> bool {
        self.get_winner().is_some() || self.is_draw()
    }

    fn reward_vec(&self) -> Vec<f32> {
        let mut rewards = vec![0.0; Self::NUM_PLAYERS];
        if let Some(winner) = self.get_winner() {
            match winner {
                Player::X => rewards[Player::X.to_index()] = 1.0,
                Player::O => rewards[Player::O.to_index()] = 1.0,
            }
        } else if self.is_draw() {
            rewards[Player::X.to_index()] = 0.5;
            rewards[Player::O.to_index()] = 0.5;
        }
        rewards
    }

    fn current_player(&self) -> usize {
        self.to_move.to_index()
    }
}

impl TicTacToeState {
    pub fn new_game() -> Self {
        TicTacToeState {
            board: [None; 9],
            to_move: Player::X,
        }
    }

    fn get_winner(&self) -> Option<Player> {
        const WIN_PATTERNS: [[usize; 3]; 8] = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
            [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
            [0, 4, 8], [2, 4, 6]             // diagonals
        ];

        for pattern in WIN_PATTERNS.iter() {
            let first = self.board[pattern[0]].as_ref();
            if first.is_some() && 
               first == self.board[pattern[1]].as_ref() && 
               first == self.board[pattern[2]].as_ref() {
                return first.cloned();
            }
        }
        None
    }

    fn get_winning_line_indices(&self) -> Option<[usize; 3]> {
        const WIN_PATTERNS: [[usize; 3]; 8] = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], 
            [0, 3, 6], [1, 4, 7], [2, 5, 8], 
            [0, 4, 8], [2, 4, 6]             
        ];
        for pattern in WIN_PATTERNS.iter() {
            let first_player_in_pattern = self.board[pattern[0]].as_ref();
            if first_player_in_pattern.is_some() && 
               self.board[pattern[0]] == self.board[pattern[1]] && 
               self.board[pattern[0]] == self.board[pattern[2]] {
                return Some(*pattern); // Return the winning pattern (indices)
            }
        }
        None
    }

    fn is_draw(&self) -> bool {
        self.get_winner().is_none() && self.board.iter().all(|cell| cell.is_some())
    }
}

#[wasm_bindgen]
pub struct TicTacToeGame {
    state: TicTacToeState,
}

#[wasm_bindgen]
impl TicTacToeGame {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        TicTacToeGame {
            state: TicTacToeState::new_game(),
        }
    }

    pub fn load_state(&mut self, board_str: &str, current_player_str: &str) -> Result<(), JsValue> {
        if board_str.len() != 9 {
            return Err(JsValue::from_str("Board string must be 9 characters long."));
        }

        let mut board = [None; 9];
        for (i, char_piece) in board_str.chars().enumerate() {
            match char_piece {
                'X' => board[i] = Some(Player::X),
                'O' => board[i] = Some(Player::O),
                '_' => board[i] = None, // Assuming '_' for empty
                _ => return Err(JsValue::from_str(&format!("Invalid character in board string: {}", char_piece))),
            }
        }

        let to_move = match current_player_str {
            "X" => Player::X,
            "O" => Player::O,
            _ => return Err(JsValue::from_str(&format!("Invalid player string: {}", current_player_str))),
        };
        
        self.state = TicTacToeState {
            board,
            to_move,
        };
        Ok(())
    }

    pub fn make_move(&mut self, index: usize) -> Result<(), JsValue> {
        let action = TicTacToeAction { index };
        if self.state.legal_actions().iter().any(|a| a.index == action.index) {
            self.state = self.state.apply_action(&action);
            Ok(())
        } else {
            Err(JsValue::from_str("Invalid move"))
        }
    }

    pub fn get_board(&self) -> JsValue {
        let board_str: Vec<String> = self.state.board.iter().map(|p| match p {
            Some(Player::X) => "X".to_string(),
            Some(Player::O) => "O".to_string(),
            None => "_".to_string(), // Represent empty cell as _ for JS
        }).collect();
        to_value(&board_str).unwrap()
    }

    // Returns "InProgress", "WinX", "WinO", "Draw"
    pub fn get_status(&self) -> String {
        if let Some(winner) = self.state.get_winner() {
            match winner {
                Player::X => "WinX".to_string(),
                Player::O => "WinO".to_string(),
            }
        } else if self.state.is_draw() {
            "Draw".to_string()
        } else {
            "InProgress".to_string()
        }
    }

    pub fn get_current_player(&self) -> String {
        match self.state.to_move {
            Player::X => "X".to_string(),
            Player::O => "O".to_string(),
        }
    }

    #[wasm_bindgen(js_name = getWinningLine)]
    pub fn get_winning_line(&self) -> JsValue {
        if let Some(line_indices) = self.state.get_winning_line_indices() {
            to_value(&line_indices).unwrap()
        } else {
            JsValue::NULL
        }
    }

    #[wasm_bindgen(js_name = aiMove)]
    pub fn ai_move(&mut self, params: JsValue) -> Result<JsValue, JsValue> {
        if self.state.is_terminal() {
            return Err(JsValue::from_str("Game is already terminal. No AI move made."));
        }

        #[derive(Deserialize)]
        struct AiParams {
            time_limit_ms: Option<u32>,
            max_simulations: Option<u32>,
            uct_c: Option<f32>,
        }

        let ai_params: AiParams = from_value(params).map_err(|e| JsValue::from_str(&format!("Invalid AI params: {}", e)))?;

        let stop_criteria = if let Some(time_ms) = ai_params.time_limit_ms {
            StopCriteria::Time(Duration::from_millis(time_ms as u64))
        } else if let Some(sims) = ai_params.max_simulations {
            StopCriteria::Simulations(sims)
        } else {
            StopCriteria::Simulations(1000) 
        };
        
        let best_action = mcts_run(&self.state, stop_criteria, ai_params.uct_c);
        self.state = self.state.apply_action(&best_action);
        
        to_value(&best_action).map_err(|e| JsValue::from_str(&format!("Failed to serialize TicTacToeAction: {}", e)))
    }
} 