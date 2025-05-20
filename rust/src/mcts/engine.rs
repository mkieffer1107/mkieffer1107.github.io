use rand::{prelude::*, Rng};
use std::rc::Rc;  // allow multiple parts of the program to share a piece of data (pointers to the same parent/child node [parent -> node <- ch1, ch2])
use std::cell::RefCell;  // allow any of them to mutate safely during runtime
use super::node::{Node, GameState};
use std::collections::HashSet;
use web_time::{Duration,Instant};

pub enum StopCriteria {
    Simulations(u32),
    Time(Duration),
}


// ##### 1. selection ######
fn tree_policy<S: GameState>(mut node: Rc<RefCell<Node<S>>>, c: f32, rng: &mut impl Rng) -> Rc<RefCell<Node<S>>> {
    // heuristically traverse tree to leaf (a game state to expand), or terminal node (end of game, and a leaf too!)
    // c is the exploration parameter 
    loop {
        // borrow only what we need
        let (is_terminal, is_fully_expanded, current_player) = {
            let n_borrow = node.borrow();
            (
                n_borrow.state.is_terminal(),
                n_borrow.is_fully_expanded(),
                n_borrow.state.current_player(),
            )
        };

        // terminal (leaf) node indicates end of game
        if is_terminal {
            return node;
        }
        // if not a terminal node (endgame state), we are in the middle of the game.
        // then we have two options:
        //   1) there are unexplored legal moves at this game state:
        //       - we can create/return a new child node that represents the game state after applying new legal move
        //       - because this is a leaf node, we break out of the loop
        //   2) all legal moves explored:
        //       - we can use the UCT equation to select the best child node to continue the game simulation
        //       - we continue depth-first search down the tree until we reach a leaf node (note, this might evaluate as terminal in next recursion)
        if !is_fully_expanded {
            return expand(node, rng); // this node will be expanded (choose an action to update the game state)
        } else {
            node = best_child(node, c, current_player); 
        }
    }
}


fn best_child<S: GameState>(node: Rc<RefCell<Node<S>>>, c: f32, player: usize) -> Rc<RefCell<Node<S>>> {
    let node_borrow = node.borrow();
    let parent_visits = node_borrow.num_visits;
    let children = &node_borrow.children;

    children
        .iter()
        .max_by(|a, b| {
            let a_val = a.borrow().uct_value(parent_visits, c, player);
            let b_val = b.borrow().uct_value(parent_visits, c, player);
            a_val.partial_cmp(&b_val).unwrap()
        })
        .expect("Node must have children when fully expanded")
        .clone()
}



// ##### 2. expansion ######
fn expand<S: GameState>(node: Rc<RefCell<Node<S>>>, rng: &mut impl Rng) -> Rc<RefCell<Node<S>>> {
    // given a node, take a new legal action, creating a new child node
    let mut mut_node = node.borrow_mut();
    let state = mut_node.get_state();

    // set of legal actions at this game state
    let legal_actions = state.legal_actions();

    // previous actions taken at this game state (actions used to create children)
    let previous_actions: Vec<S::Action> = mut_node.children
        .iter()
        .filter_map(|child| child.borrow().get_action())
        .collect();
    let previous_set: HashSet<_> = previous_actions.into_iter().collect();

    // unused actions (legal-prev)
    let new_actions: Vec<S::Action> = legal_actions
        .into_iter()
        .filter(|action| !previous_set.contains(action))
        .collect();

    let next_action = new_actions
        .choose(rng)
        .expect("No new actions :(")
        .clone();

    // update the game state with the new action
    let new_state = state.apply_action(&next_action);  

    // wrap this new state and action within child node class
    let child_node = Rc::new(RefCell::new(Node::new(
        new_state,
        Some(node.clone()),
        Some(next_action)
    )));

    mut_node.add_child(child_node.clone());
    child_node
}



// ##### 3. simulation / rollout ######
fn simulate<S: GameState>(state: &S, rng: &mut impl Rng) -> Vec<f32> {
    // randomly progress the game state until concluded
    let mut current_state = state.clone();

    while !current_state.is_terminal() {
        let legal_actions = current_state.legal_actions();
        if legal_actions.is_empty() {
            break; // in case we somehow don't catch terminal state above
        }
        
        let random_action = legal_actions
            .choose(rng)
            .expect("problem ahhhh")
            .clone();

        current_state = current_state.apply_action(&random_action);
    }

    // result at end of game from the perspective of the player who 
    // moved to create the original state passed into the function
    current_state.reward_vec() 
}



// ##### 4. backpropagation ######
fn backpropagate<S: GameState>(node: Rc<RefCell<Node<S>>>, reward_vec: Vec<f32>) {
    let mut current_node = Some(node);

    while let Some(node) = current_node {
        let mut mut_node = node.borrow_mut();
        mut_node.visit();
        mut_node.add_reward(&reward_vec);
        current_node = mut_node.get_parent();
    }
}


const DEFAULT_UCT_C: f32 = 1.41421356237; // sqrt(2.0)


pub fn run<S: GameState>(root: &S, criteria: StopCriteria, uct_c: Option<f32>) -> S::Action {
    let mut rng = rand::rng();

    // create a root node out of the current game state
    let root_node = Rc::new(RefCell::new(Node::new(root.clone(), None, None)));

    let start_time = Instant::now();
    let mut simulation_count = 0u32;

    let exploration_constant = uct_c.unwrap_or(DEFAULT_UCT_C);

    loop {
        match criteria {
            StopCriteria::Simulations(max_sims) => {
                if simulation_count >= max_sims {
                    break;
                }
            }
            StopCriteria::Time(max_duration) => {
                if start_time.elapsed() >= max_duration {
                    break;
                }
            }
        }

        // select a node to expand following heuristic tree policy. when expanding 
        // the selected node, we take an action from the current game state,
        // creating a new game state and child node. expanded_node is this child node.
        let expanded_node = tree_policy(root_node.clone(), exploration_constant, &mut rng);

        // simulate the rest of the game from this new child node
        let reward_vec = simulate(&expanded_node.borrow().state, &mut rng);

        // backpropagate the result up the tree
        backpropagate(expanded_node, reward_vec);

        simulation_count += 1;
    }

    // robust child approach -- choose the action/child node with the most visits, not highest avg reward
    let root_borrow = root_node.borrow();
    let best_child = root_borrow.children
        .iter()
        .max_by_key(|child| child.borrow().num_visits)
        .expect("Root should have children after simulations");
    
    best_child.borrow().action.clone()
        .expect("Child nodes should have actions")
}
