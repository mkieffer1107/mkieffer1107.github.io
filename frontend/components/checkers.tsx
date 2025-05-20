// checkers.tsx
"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { CheckersGame, CheckersBoard, CheckersMove, MultiJumpData, RustPiece } from "@/lib/checkers-game" 
import GameStatusDisplay from "./game-status-display"; // New import
import type { JSX } from "react/jsx-runtime"

interface CheckersProps {
  aiMode: "time" | "simulations"
  thinkingTime: number
  simulationCount: number
  uctParameter: number
  onGameOver: (isOver: boolean) => void
  resetTrigger: number
  gameOver: boolean
  onReset: () => void
  onStatusChange: (status: string | JSX.Element, color?: string) => void
  onBotThinkingStart: () => void
  onBotThinkingEnd: () => void
}

// These need to match the Rust enum strings: Player::Black -> "Black", Player::Red -> "Red"
const HUMAN_PLAYER_RUST_STR = "Black"; 
const AI_PLAYER_RUST_STR = "Red";   

export default function Checkers({
  aiMode,
  thinkingTime,
  simulationCount,
  uctParameter,
  onGameOver,
  resetTrigger,
  gameOver: gameOverProp, // Renamed to avoid conflict with local gameOver
  onReset,
  onStatusChange,
  onBotThinkingStart,
  onBotThinkingEnd,
}: CheckersProps) {
  const [game, setGame] = useState<CheckersGame | null>(null)
  // Board state now uses RustPiece | null for cells
  const [board, setBoard] = useState<CheckersBoard>(() => Array(8).fill(null).map(() => Array(8).fill(null)));
  const [selectedPiece, setSelectedPiece] = useState<{ row: number; col: number } | null>(null)
  // possibleMoves will now be of type CheckersMove[] from WASM
  const [possibleMoves, setPossibleMoves] = useState<CheckersMove[]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true) // Human (black) starts
  const [isThinking, setIsThinking] = useState(false)
  const [winner, setWinner] = useState<"red" | "black" | "draw" | null>(null)
  // winningLine concept is minimal in Rust Checkers, mostly for UI consistency if needed
  const [winningPieces, setWinningPieces] = useState<{ row: number; col: number }[] | null>(null)
  const [isGameReady, setIsGameReady] = useState(false);
  const [multiJumpInfo, setMultiJumpInfo] = useState<MultiJumpData | null>(null); // New state for multi-jump
  const [aiNextMoveHighlight, setAiNextMoveHighlight] = useState<{ row: number; col: number } | null>(null); // For highlighting AI's next hop

  const currentResetTriggerRef = useRef(resetTrigger)
  const isProcessingClickRef = useRef(false) // To prevent concurrent clicks

  const PLAYER_COLOR = "#2c3e50" // Black pieces (human)
  const BOT_COLOR = "#e74c3c"    // Red pieces (AI)
  const WIN_COLOR = "#27ae60"
  const LOSE_COLOR = "#c0392b"
  const DRAW_COLOR = "#f39c12"

  const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

  // Initialize and Reset Game
  useEffect(() => {
    currentResetTriggerRef.current = resetTrigger;
    let newGameInstance: CheckersGame | null = null;

    const initializeGame = async () => {
      setIsGameReady(false);
      setAiNextMoveHighlight(null); // Clear highlight on game init/reset
      // onStatusChange("Loading Checkers Engine...", "#3498db"); // Old
      onStatusChange(<GameStatusDisplay statusKey="loading" color="#3498db" />, "#3498db");
      isProcessingClickRef.current = false; 
      setMultiJumpInfo(null); // Reset multi-jump info on new game

      if (game) {
        // console.log("Freeing previous Checkers game instance during reset/init.");
        game.free();
      }
      
      newGameInstance = new CheckersGame();
      try {
        await newGameInstance.initialize();
        setGame(newGameInstance);
        updateGameStateFromWasm(newGameInstance);
        setIsGameReady(true);
        
        const initialPlayer = newGameInstance.getCurrentPlayer(); // Returns "red" or "black" (lowercase)
        if (initialPlayer === AI_PLAYER_RUST_STR.toLowerCase()) { // AI is "red", human is "black"
          onStatusChange(
            <GameStatusDisplay 
              statusKey="botTurn" 
              color={BOT_COLOR} 
            />, 
            BOT_COLOR
          );
           // If AI should start and game is not over
          if (!newGameInstance.isGameOver()) { // Check game over *before* setting player turn
            setIsPlayerTurn(false); // This will trigger AI move via useEffect
          }
        } else { // Human's turn
           onStatusChange(<GameStatusDisplay statusKey="playerTurn" color={PLAYER_COLOR} />, PLAYER_COLOR);
           setIsPlayerTurn(true);
        }

      } catch (error) {
        console.error("Failed to initialize Checkers WASM game:", error);
        // onStatusChange("Error loading game! 😭 Please refresh.", "#e74c3c"); // Old
        onStatusChange(
          <GameStatusDisplay 
            statusKey="error" 
            message="Error loading game! 😭 Please refresh." 
            color="#e74c3c" 
          />, 
          "#e74c3c"
        );
        setGame(null);
      }
    };

    initializeGame();

    return () => {
      // console.log("Checkers component cleanup: Freeing WASM game instance.");
      if (newGameInstance) {
        newGameInstance.free();
      } else if (game) { // If initializeGame didn't complete but old game exists
        game.free();
      }
      setGame(null);
    };
  }, [resetTrigger]); // Dependencies for re-initialization

  const updateGameStateFromWasm = (currentGameInstance: CheckersGame | null = game) => {
    if (!currentGameInstance) return;

    setBoard(currentGameInstance.getBoard()); // game.getBoard() now returns RustPiece[][] | null[][]
    const currentWasmPlayer = currentGameInstance.getCurrentPlayer(); // "red" or "black"
    setIsPlayerTurn(currentWasmPlayer === HUMAN_PLAYER_RUST_STR.toLowerCase());
    
    const gameWinner = currentGameInstance.getWinner(); // "red", "black", "draw" or null
    setWinner(gameWinner);
    const currentMultiJumpInfo = currentGameInstance.isInMultiJump();
    setMultiJumpInfo(currentMultiJumpInfo);

    if (currentGameInstance.isGameOver()) {
        onGameOver(true);
        if (gameWinner === "draw") {
            onStatusChange(<GameStatusDisplay statusKey="draw" color={DRAW_COLOR} />, DRAW_COLOR);
        } else if (gameWinner === HUMAN_PLAYER_RUST_STR.toLowerCase()) { // Human wins
            onStatusChange(<GameStatusDisplay statusKey="playerWin" color={WIN_COLOR} />, WIN_COLOR);
        } else if (gameWinner === AI_PLAYER_RUST_STR.toLowerCase()) { // AI wins
            onStatusChange(<GameStatusDisplay statusKey="botWin" color={LOSE_COLOR} />, LOSE_COLOR);
        } else {
            //  onStatusChange("Game Over!", "#bdc3c7"); // Old generic, can be removed
        }
        setPossibleMoves([]);
        setSelectedPiece(null); // Always clear selected piece on game over
    } else {
        onGameOver(false);
        if (currentWasmPlayer === HUMAN_PLAYER_RUST_STR.toLowerCase()) {
            // Set status text, considering multi-jump
            if (currentMultiJumpInfo.active && currentMultiJumpInfo.row !== undefined && currentMultiJumpInfo.col !== undefined) {
                onStatusChange(<GameStatusDisplay statusKey="playerMultiJump" color={PLAYER_COLOR} />, PLAYER_COLOR);
                setSelectedPiece({ row: currentMultiJumpInfo.row, col: currentMultiJumpInfo.col });
                setPossibleMoves(currentGameInstance.getPossibleMovesForPiece(currentMultiJumpInfo.row, currentMultiJumpInfo.col));
            } else {
                onStatusChange(<GameStatusDisplay statusKey="playerTurn" color={PLAYER_COLOR} />, PLAYER_COLOR);
            }
        } else { // AI's turn
            onStatusChange(
              <GameStatusDisplay 
                statusKey="botTurn" 
                color={BOT_COLOR} 
              />, 
              BOT_COLOR
            );
            setSelectedPiece(null);
            setPossibleMoves([]);
        }
    }
    // winningLine for checkers is not a line, but a set of winning pieces. 
    // The Rust side currently returns null for getWinningLine. 
    // If we want to highlight all winner's pieces, we can do it client-side:
    if (gameWinner && gameWinner !== 'draw') {
        const currentBoard = currentGameInstance.getBoard(); // RustPiece[][] | null[][]
        const pieces: {row: number, col: number}[] = [];
        // Winner is "red" or "black". RustPiece.player is "Red" or "Black"
        const winnerRustPlayer = gameWinner === HUMAN_PLAYER_RUST_STR.toLowerCase() ? HUMAN_PLAYER_RUST_STR : AI_PLAYER_RUST_STR;
        currentBoard.forEach((rowVal, r) => {
            rowVal.forEach((cell, c) => {
                if (cell && cell.player === winnerRustPlayer) { // Check cell is not null
                    pieces.push({row: r, col: c});
                }
            });
        });
        setWinningPieces(pieces);
    } else {
        setWinningPieces(null);
    }
  };

  // Trigger AI move
  useEffect(() => {
    if (isGameReady && game && !isPlayerTurn && !winner && !game.isGameOver()) {
      makeAIMove();
    }
  }, [isGameReady, game, isPlayerTurn, winner]);

  // Notify parent about game over state change from local winner state
  useEffect(() => {
    if (winner !== null) {
      onGameOver(true);
    } else {
      // This case might be redundant if updateGameStateFromWasm handles it
      // onGameOver(false); 
    }
  }, [winner, onGameOver]);

  // If parent externally signals game is no longer over (e.g. via prop), and we have a winner, means reset
  useEffect(() => {
    if (!gameOverProp && winner !== null && game) {
       // This typically means a reset was triggered externally by parent
       // The main reset logic is tied to `resetTrigger`
      //  console.log("Parent indicated gameOver is false, but local winner exists. Reset should be handled by trigger.")
    }
  }, [gameOverProp, winner, game]);

  const makeAIMove = async (isContinuationCall: boolean = false) => {
    if (!game || !isGameReady || game.isGameOver() || isPlayerTurn) {
      return;
    }
    // If AI is already processing its turn (isThinking is true),
    // only proceed if this is a continuation call (part of a multi-jump sequence).
    // If it's a new external call (e.g., from useEffect) while AI is already thinking, ignore it.
    if (isThinking && !isContinuationCall) {
      // console.log("makeAIMove called externally while AI is already thinking. Ignoring.");
      return;
    }

    const startingResetTrigger = currentResetTriggerRef.current;

    if (!isContinuationCall) {
      setIsThinking(true);
      onBotThinkingStart();
      // Display thinking status immediately for the start of AI's turn
      onStatusChange(
        <GameStatusDisplay 
          statusKey="botTurn" 
          color={BOT_COLOR} 
        />, 
        BOT_COLOR
      );
      await delay(100); // Brief pause for UI to update with thinking status
    }
    
    try {
      const params = aiMode === "time"
        ? { timeLimitMs: thinkingTime * 1000, uctC: uctParameter }
        : { maxSimulations: simulationCount, uctC: uctParameter };
      
      // chosenAiMove is the move the AI will make in *this* step/hop
      const chosenAiMove = await game.aiMove(params); 

      if (startingResetTrigger !== currentResetTriggerRef.current) {
        // console.log("Game was reset during AI move calculation (Checkers), ignoring result.");
        setIsThinking(false); // Ensure thinking is reset if aborting
        onBotThinkingEnd();
        setAiNextMoveHighlight(null); // Clear highlight on reset
        return;
      }
      
      // Check if the AI is currently in a multi-jump sequence *before* making this move.
      // This implies this `chosenAiMove` is a continuation jump.
      const isContinuationJump = game.isInMultiJump().active; 

      if (isContinuationJump && chosenAiMove && typeof chosenAiMove.to_row === 'number') {
        setAiNextMoveHighlight({ row: chosenAiMove.to_row, col: chosenAiMove.to_col });
        await delay(1000); // Pause with highlight ON
      } else {
        // For the very first AI move of a turn (not a multi-jump continuation part), 
        // or if it is a multi-jump but for some reason highlight isn't desired here,
        // we can add a shorter, standard delay if needed, or no delay.
        // For now, only delay with highlight on multi-jump continuations.
      }

      if (game && chosenAiMove && typeof chosenAiMove.to_row === 'number') { // Check if it's a valid-looking Move object
        game.makeMove(chosenAiMove); // Apply the AI's chosen move object
      } else {
        console.warn(`Checkers: AI worker returned an invalid or null move, or game state changed. Move: ${JSON.stringify(chosenAiMove)}, Game Status: ${game?.getStatus()}`);
      }
      setAiNextMoveHighlight(null); // Clear highlight immediately after move is made or if move is invalid
      
      updateGameStateFromWasm(); // Update board, player, status from WASM

      // Check for AI multi-jump continuation *after* the move
      if (game && !game.isGameOver()) {
        const currentWasmPlayer = game.getCurrentPlayer();
        const currentMultiJumpInfoAfterMove = game.isInMultiJump(); // Re-fetch, as makeMove might change this
        
        if (currentWasmPlayer === AI_PLAYER_RUST_STR.toLowerCase() && currentMultiJumpInfoAfterMove.active) {
          // AI has another jump to make
          onStatusChange(
            <GameStatusDisplay 
              statusKey="aiContinuingJump" 
              color={BOT_COLOR} 
            />, 
            BOT_COLOR
          );
          // The delay for the *next* segment is now handled at the start of the *next* `makeAIMove` call if it's a continuation.
          // So, we don't need a delay here before the recursive call.
          // await delay(1000); // OLD DELAY - REMOVED

          if (startingResetTrigger !== currentResetTriggerRef.current) {
            // console.log("Game was reset during AI multi-jump logic (Checkers), aborting.");
            setIsThinking(false);
            onBotThinkingEnd();
            setAiNextMoveHighlight(null); // Clear highlight
            return;
          }
          makeAIMove(true); // Pass true for continuation call
          return; 
        }
      }

    } catch (error) {
      console.error("Error during AI move (WASM Checkers):", error);
      setAiNextMoveHighlight(null); // Clear highlight on error
      if (startingResetTrigger === currentResetTriggerRef.current) {
        onStatusChange(
          <GameStatusDisplay 
            statusKey="error" 
            message="AI error - Your turn (Black) 🫵" 
            color={PLAYER_COLOR} 
          />, 
          PLAYER_COLOR
        );
        setIsPlayerTurn(true); 
        updateGameStateFromWasm(); // Ensure UI reflects player's turn and current board
      }
    } finally {
      // This block will run unless makeAIMove was called recursively for a multi-jump
      // and returned early. In that case, the subsequent call's finally block will handle it.
      if (game && game.getCurrentPlayer() !== AI_PLAYER_RUST_STR.toLowerCase() || game.isGameOver() || !game.isInMultiJump().active) {
         if (startingResetTrigger === currentResetTriggerRef.current) {
            setIsThinking(false);
            onBotThinkingEnd();
            setAiNextMoveHighlight(null); // Clear highlight when AI turn ends or game over
            isProcessingClickRef.current = false; 
        }
      }
    }
  };

  const handleSquareClick = (row: number, col: number) => {
    if (isProcessingClickRef.current || !isGameReady || !game || !isPlayerTurn || winner || isThinking || game.isGameOver()) {
      return;
    }
    isProcessingClickRef.current = true;

    try {
      const pieceClicked = board[row][col]; // This is now RustPiece | null
      // Human player is Black. Rust Piece.player will be "Black".
      const isMyPiece = pieceClicked !== null && pieceClicked.player === HUMAN_PLAYER_RUST_STR; 

      if (multiJumpInfo?.active && multiJumpInfo.row !== undefined && multiJumpInfo.col !== undefined) {
        // In a multi-jump sequence
        if (selectedPiece && selectedPiece.row === multiJumpInfo.row && selectedPiece.col === multiJumpInfo.col) {
          // The forced piece is already selected, try to make the move to (row, col)
          const targetMove = possibleMoves.find((m) => m.to_row === row && m.to_col === col);
          if (targetMove) {
            // Pass the entire Move object, which includes is_capture and captured_pos
            game.makeMove(targetMove);
            updateGameStateFromWasm(); // This will update multiJumpInfo from Rust
            // selectedPiece and possibleMoves will be updated by updateGameStateFromWasm if multi-jump continues
          } else {
            // Clicked somewhere else, not a valid continuation of the multi-jump. Do nothing or give feedback.
          }
        } else {
          // Clicked, but not on the piece that must multi-jump, or the piece isn't selected. 
          // This state should ideally be prevented by disabling clicks on other pieces.
        }
      } else {
        // Not in a multi-jump sequence
        if (selectedPiece) {
          const targetMove = possibleMoves.find((m) => m.to_row === row && m.to_col === col);
          if (targetMove) {
            // Pass the entire Move object
            game.makeMove(targetMove);
            updateGameStateFromWasm(); // This will update multiJumpInfo from Rust
            // If this move initiates a multi-jump, updateGameStateFromWasm will handle new selection and moves
            // If not, clear selection
            if (!game.isInMultiJump().active) { // Check immediate result before full state update if needed
                 setSelectedPiece(null);
                 setPossibleMoves([]);
            }
          } else if (isMyPiece && selectedPiece.row === row && selectedPiece.col === col) { // isMyPiece already checks for pieceClicked !== null
            setSelectedPiece(null);
            setPossibleMoves([]);
          } else if (isMyPiece) { // isMyPiece already checks for pieceClicked !== null
            setSelectedPiece({ row, col });
            setPossibleMoves(game.getPossibleMovesForPiece(row, col));
          } else {
            setSelectedPiece(null);
            setPossibleMoves([]);
          }
        } else if (isMyPiece) { // isMyPiece already checks for pieceClicked !== null
          setSelectedPiece({ row, col });
          setPossibleMoves(game.getPossibleMovesForPiece(row, col));
        }
      }
    } catch (error) {
      console.error("Error handling square click (WASM Checkers):", error);
      // Optionally, re-sync game state if error is recoverable
      updateGameStateFromWasm(); 
      setSelectedPiece(null);
      setPossibleMoves([]);
      onStatusChange(
        <GameStatusDisplay 
          statusKey="error" 
          message="Move error. Try again. 🤔" 
          color={PLAYER_COLOR} 
        />, 
        PLAYER_COLOR
      );
    } finally {
      isProcessingClickRef.current = false;
    }
  };

  // Helpers for UI rendering
  const pieceCanBeSelected = (r: number, c: number): boolean => {
    if (!isPlayerTurn || winner || isThinking || !game || game.isGameOver()) return false;
    const piece = board[r][c]; // RustPiece | null
    if (!piece || piece.player !== HUMAN_PLAYER_RUST_STR) return false; // Human player is Black
    
    if (multiJumpInfo?.active && multiJumpInfo.row !== undefined && multiJumpInfo.col !== undefined) {
      return r === multiJumpInfo.row && c === multiJumpInfo.col; // Only the multi-jump piece can be "re-selected" or interacted with
    }
    // If not in multi-jump, any piece with moves can be selected.
    // getPossibleMovesForPiece from Rust will correctly return only capture moves if any are forced for that piece.
    const moves = game.getPossibleMovesForPiece(r, c);
    return moves.length > 0;
  };

  const isValidMoveDestination = (r: number, c: number): boolean =>
    possibleMoves.some((m) => m.to_row === r && m.to_col === c);

  const getSquareColor = (r: number, c: number) => {
    const isBlackSquare = (r + c) % 2 === 1;

    // Highlight for AI's next move in a multi-jump sequence
    if (aiNextMoveHighlight && aiNextMoveHighlight.row === r && aiNextMoveHighlight.col === c) {
      return "bg-purple-500"; // Or any other distinct color
    }

    // If piece is part of an active multi-jump, it should remain styled as selected.
    if (multiJumpInfo?.active && multiJumpInfo.row === r && multiJumpInfo.col === c) {
        return "bg-blue-600"; 
    }
    if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) {
      return "bg-blue-600";
    }
    if (isValidMoveDestination(r, c)) {
      return "bg-blue-400";
    }
    return isBlackSquare ? "bg-gray-700" : "bg-gray-300";
  };

  const shouldShowClickCursor = (r: number, c: number): boolean => {
    if (!isPlayerTurn || winner || isThinking || !game || game.isGameOver()) return false;
    if (isValidMoveDestination(r, c)) return true;

    if (multiJumpInfo?.active && multiJumpInfo.row !== undefined && multiJumpInfo.col !== undefined) {
      // If in multi-jump, only the active piece or its valid destinations are clickable.
      return (r === multiJumpInfo.row && c === multiJumpInfo.col);
    }
    // If not in multi-jump: can click to select own piece, or deselect current selection
    if (selectedPiece && selectedPiece.row === r && selectedPiece.col === c) return true;
    const piece = board[r][c]; // RustPiece | null
    if (piece && piece.player === HUMAN_PLAYER_RUST_STR) { // Check piece exists and is human's
        return pieceCanBeSelected(r,c);
    }
    return false;
  };

  const isWinningCellUI = (row: number, col: number): boolean =>
    winningPieces?.some((pos) => pos.row === row && pos.col === col) || false;

  // Initial loading display
  if (!isGameReady || !game) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-md p-4 bg-gray-800 rounded-lg shadow-xl" style={{minHeight: '400px'}}>
        <GameStatusDisplay statusKey="loading" color="#ecf0f1" />
        <p className="text-white mt-3">Initializing Checkers Engine...</p> {/* This specific text can remain */} 
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-[336px] h-[336px] flex items-center justify-center">
        <div className="grid grid-cols-8 border-2 border-gray-800">
          {board.map((rowArr, rowIndex) =>
            rowArr.map((piece, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`w-10 h-10 relative ${getSquareColor(rowIndex, colIndex)} ${shouldShowClickCursor(rowIndex, colIndex) ? "cursor-pointer" : "cursor-default"} ${isValidMoveDestination(rowIndex, colIndex) ? "hover:opacity-80 transition-opacity duration-150" : ""}`}
                onClick={() => handleSquareClick(rowIndex, colIndex)}
              >
                {piece && (
                  <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full
                      ${piece.player === AI_PLAYER_RUST_STR ? "bg-red-500" : "bg-black"}
                      ${isWinningCellUI(rowIndex, colIndex) ? "ring-2 ring-yellow-300 ring-offset-1 [animation:pulse_2s_ease-in-out_infinite]" : ""}
                      ${ (selectedPiece && selectedPiece.row === rowIndex && selectedPiece.col === colIndex) || 
                         (multiJumpInfo?.active && multiJumpInfo.row === rowIndex && multiJumpInfo.col === colIndex && isPlayerTurn) 
                         ? "ring-2 ring-blue-300 ring-offset-1" : ""}\
                      ${piece.player === HUMAN_PLAYER_RUST_STR && !selectedPiece && !(multiJumpInfo?.active) && isPlayerTurn && !isThinking && !winner && pieceCanBeSelected(rowIndex, colIndex) ? "hover:ring-2 hover:ring-blue-300 hover:ring-offset-1" : "" }\
                      transition-all duration-150`}
                  >
                    {piece.piece_type === "King" && (
                      <div className="absolute inset-0 flex items-center justify-center text-yellow-300 text-xs font-bold">
                        👑
                      </div>
                    )}
                  </div>
                )}
                {isValidMoveDestination(rowIndex, colIndex) && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3 h-3 bg-blue-300 rounded-full opacity-70 animate-pulse"></div>
                  </div>
                )}
              </div>
            )),
          )}
        </div>
      </div>

      {winner && game.isGameOver() && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={onReset} // Prop from parent handles the reset trigger increment
            className={`
              ${winner === HUMAN_PLAYER_RUST_STR.toLowerCase() // Human wins
                  ? "bg-[#2ecc71] hover:bg-[#27ae60]" // green theme
                  : winner === AI_PLAYER_RUST_STR.toLowerCase() // Bot wins
                    ? "bg-[#E11D48] hover:bg-[#BE123C]" // red theme (original lose color)
                    : "bg-[#f39c12] hover:bg-[#e67e22]" // Draw: orange theme
              }
              text-white font-bold py-3 px-6 rounded-lg shadow-md hover:translate-y-[-2px] active:translate-y-[1px] transition-all text-lg`}
          >
            New Game
          </Button>
        </div>
      )}
    </div>
  );
}
