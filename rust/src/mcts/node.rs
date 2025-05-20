use serde::Serialize;
use std::rc::Rc;  // allow multiple parts of the program to share a piece of data (pointers to the same parent/child node [parent -> node <- ch1, ch2])
use std::cell::RefCell;  // allow any of them to mutate safely during runtime
use std::hash::Hash;


pub trait GameState: Clone {
    type Action: Clone + Serialize + PartialEq + Eq + Hash;
    const NUM_PLAYERS: usize;
    fn legal_actions(&self) -> Vec<Self::Action>;
    fn apply_action(&self, action: &Self::Action) -> Self;
    fn is_terminal(&self) -> bool;
    fn reward_vec(&self) -> Vec<f32>;  // vec of size NUM_PLAYERS storing each player's reward
    fn current_player(&self) -> usize; // player turn, zero indexed
}


#[derive(Clone)]
pub struct Node<S: GameState> {
    pub state: S,
    pub parent: Option<Rc<RefCell<Node<S>>>>, 
    pub children: Vec<Rc<RefCell<Node<S>>>>,
    pub action: Option<S::Action>,
    pub num_visits: u32,
    pub reward_vals: Vec<f32>,
}


impl<S: GameState> Node<S> {
    pub fn new(state: S, parent: Option<Rc<RefCell<Node<S>>>>, action: Option<S::Action>) -> Self {
        Node {
            state,
            parent,
            children: Vec::new(),
            action,
            num_visits: 0,
            reward_vals: vec![0.0; S::NUM_PLAYERS], 
        }
    }

    pub fn get_action(&self) -> Option<S::Action> {
        // get action used to create this node
        self.action.clone()
    }

    pub fn get_state(&self) -> S {
        // get game state contained within node
        self.state.clone()
    }

    pub fn get_parent(&self) -> Option<Rc<RefCell<Node<S>>>> {
        self.parent.clone()
    }

    pub fn get_children(&self) -> &Vec<Rc<RefCell<Node<S>>>> {
        &self.children
    }

    pub fn add_child(&mut self, child: Rc<RefCell<Node<S>>>) {
        self.children.push(child);
    }

    pub fn get_num_visits(&self) -> u32 {
        // get number of times this node has been visited
        self.num_visits
    }

    pub fn reward_value(&self, player: usize) -> f32 {
        // the reward value for the given player id
        assert!(player < S::NUM_PLAYERS, "Player index {} out of bounds for {} players", player, S::NUM_PLAYERS);
        self.reward_vals[player]
    }

    pub fn add_reward(&mut self, rewards: &[f32]) {
        // add a vector of rewards to the current node reward vec
        assert_eq!(rewards.len(), S::NUM_PLAYERS, "Reward vector size doesn't match number of players");
        for (i, &reward) in rewards.iter().enumerate() {
            self.reward_vals[i] += reward;
        }
    }

    pub fn visit(&mut self) {
        self.num_visits += 1;
    }

    pub fn is_fully_expanded(&self) -> bool {
        // check if all legal moves have been exhausted to create child nodes
        // let legal_actions = self.state.legal_actions();
        
        // approach 1
        // get the moves of the children
        // let child_actions: Vec<S::Action> = self.children
        //     .iter()
        //     .filter_map(|child| child.borrow().action.clone())
        //     .collect();
        // legal_actions.iter().all(|m| child_actions.contains(m))
        
        // approach 2
        // avoids cloning. still is a nested iteration, O(n^2), but less memory overhead
        // legal_actions.iter().all(|m| self.children.iter().any(|child| child.borrow().action.as_ref() == Some(m)))
        
        // approach 3
        // we can optimize this though because:
        //   1) the set of legal_actions is always unique
        //   2) once added, child nodes are never removed
        //   3) expanding a node only adds unique child nodes, actions not yet taken
        // so, we know that the node is fully expanded when |legal_actions| = |children|
        // giving us a linear time complexity. actually, the vec.len() method in rust has
        // O(1) complexity, so the complexity actually comes from the legal_actions function.
        if self.state.is_terminal() {
            return true; // terminal has 0 children and 0 legal actions
        }
        self.children.len() == self.state.legal_actions().len()
    }

    pub fn uct_value(&self, parent_visits: u32, c: f32, player: usize) -> f32 {
        // c is the exploration parameter. higher values encourage exploration of tree.
        // player is the index of the current player (we must consider reward for each player individually)

        // num_visits is a divisor in the exploitation and exploration terms. then, we can
        // say that exploration_val propto 1 / 0 --> infty. so return that here to avoid errors 
        if self.num_visits == 0 {
            return f32::INFINITY; 
        }
        
        // exploitation value is propto the reward accumulated at this node, and inversely
        // propto the number of times it has been visited -- this is just the average reward.
        // if the average reward is high, then this node looks promising... exploit it!
        let exploitation_val = self.reward_value(player) / self.num_visits as f32;

        // exploration value is propto the number of times the parent has been visited, and
        // inversely propto the number of times it has been visited. then, over-explored
        // nodes (really, the actions used to create these nodes) are penalized since num_visits
        // will be high. this encourages underexplored branches, where num_visits is low, to 
        // occasionally be visited. in addition, we see that high c values will promote exploration.
        let exploration_val = c * ((parent_visits as f32).ln() / self.num_visits as f32).sqrt();
        exploitation_val + exploration_val
    }
}