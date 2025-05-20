"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { ConnectFourGame, ConnectFourBoard, ConnectFourWinningLine, ConnectFourPiece } from "@/lib/connect-four-game"
import GameStatusDisplay from "./game-status-display"
import type { JSX } from "react"

interface ConnectFourProps {
  aiMode: "time" | "simulations"
  thinkingTime: number // in seconds
  simulationCount: number
  uctParameter: number
  onGameOver: (isOver: boolean) => void
  resetTrigger: number
  gameOver: boolean // Controlled by parent, indicates if the game *should be* over
  onReset: () => void // Function to call when the New Game button is clicked
  onStatusChange: (status: string | JSX.Element, color?: string) => void
  onBotThinkingStart: () => void
  onBotThinkingEnd: () => void
}

const ROWS = 6;
const COLS = 7;
const PLAYER_RED_COLOR = "#ef4444"; // Tailwind's red-500
const PLAYER_YELLOW_COLOR = "#facc15"; // Tailwind's yellow-400
const BOT_THINKING_COLOR = "#facc15"; // AI is Yellow, use yellow for thinking
const EMPTY_CELL_COLOR = "#3B82F6"; // bg-blue-500 for empty cell hover, actual slot is darker
const BOARD_BACKGROUND_COLOR = "#2563EB"; // bg-blue-600 for game board container

export default function ConnectFour({
  aiMode,
  thinkingTime,
  simulationCount,
  uctParameter,
  onGameOver,
  resetTrigger,
  gameOver,
  onReset,
  onStatusChange,
  onBotThinkingStart,
  onBotThinkingEnd,
}: ConnectFourProps) {
  const [game, setGame] = useState<ConnectFourGame | null>(null)
  const [board, setBoard] = useState<ConnectFourBoard>(() => Array(ROWS).fill(null).map(() => Array(COLS).fill("")))
  const [isPlayerTurn, setIsPlayerTurn] = useState(true) // Human is typically "red" and starts
  const [isThinking, setIsThinking] = useState(false)
  const [winner, setWinner] = useState<string | null>(null) // "red", "yellow", or "draw"
  const [winningLine, setWinningLine] = useState<ConnectFourWinningLine | null>(null)
  const [isGameReady, setIsGameReady] = useState(false)
  const [previewCell, setPreviewCell] = useState<{row: number, col: number} | null>(null);

  const humanPlayerPiece: ConnectFourPiece = "red"; // Human player is always red for this component
  const aiPlayerPiece: ConnectFourPiece = "yellow"; // AI player is always yellow

  const currentResetTriggerRef = useRef(resetTrigger);

  useEffect(() => {
    currentResetTriggerRef.current = resetTrigger;
    let newGameInstance: ConnectFourGame | null = null;

    const initializeGame = async () => {
      setIsGameReady(false);
      onStatusChange(<GameStatusDisplay statusKey="loading" color="#3498db" />, "#3498db");

      if (game) {
        // console.log("Freeing previous Connect Four game instance during reset/init.");
        game.free();
      }
      
      newGameInstance = new ConnectFourGame();
      try {
        await newGameInstance.initialize();
        setGame(newGameInstance);
        setBoard(newGameInstance.getBoard());
        const currentPlayerWasm = newGameInstance.getCurrentPlayer();
        setIsPlayerTurn(currentPlayerWasm === humanPlayerPiece);
        setWinner(null);
        setWinningLine(null);
        setIsThinking(false);
        onGameOver(false);
        setIsGameReady(true);
        
        onStatusChange(
          <GameStatusDisplay 
            statusKey={currentPlayerWasm === humanPlayerPiece ? "playerTurn" : "botTurn"} 
            color={currentPlayerWasm === humanPlayerPiece ? PLAYER_RED_COLOR : BOT_THINKING_COLOR}
          />, 
          currentPlayerWasm === humanPlayerPiece ? PLAYER_RED_COLOR : BOT_THINKING_COLOR
        );

        if (currentPlayerWasm === aiPlayerPiece && !newGameInstance.isGameOver()) {
          setIsPlayerTurn(false); // Trigger AI move if it's AI's turn to start
        }

      } catch (error) {
        console.error("Failed to initialize ConnectFour WASM game:", error);
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
      // console.log("ConnectFour component cleanup: Freeing WASM game instance.");
      if (newGameInstance) {
        newGameInstance.free();
      } else if (game) {
        game.free();
      }
      setGame(null);
    };
  }, [resetTrigger]); // onGameOver, humanPlayerPiece, aiPlayerPiece, onStatusChange are stable or setters

  useEffect(() => {
    if (isGameReady && game && !isPlayerTurn && !winner && !game.isGameOver() && !isThinking) {
      makeAIMove();
    }
  }, [isGameReady, game, isPlayerTurn, winner, isThinking]);

   useEffect(() => {
    if (winner !== null) {
      onGameOver(true);
    }
  }, [winner, onGameOver]);

  const updateGameStateFromWasm = () => {
    if (!game) return;

    const newBoard = game.getBoard();
    const gameWinner = game.getWinner(); // "red", "yellow", "draw", or null
    const currentWasmPlayer = game.getCurrentPlayer();
    
    setBoard(newBoard);

    if (gameWinner) {
      setWinner(gameWinner);
      setWinningLine(game.getWinningLine());
      if (gameWinner === "draw") {
        onStatusChange(<GameStatusDisplay statusKey="draw" color="#f39c12" />, "#f39c12");
      } else if (gameWinner === humanPlayerPiece) {
        onStatusChange(<GameStatusDisplay statusKey="playerWin" color="#27ae60" />, "#27ae60");
      } else {
        onStatusChange(<GameStatusDisplay statusKey="botWin" color="#c0392b" />, "#c0392b");
      }
      setIsPlayerTurn(false); // No more turns
    } else {
      onStatusChange(
        <GameStatusDisplay 
          statusKey={currentWasmPlayer === humanPlayerPiece ? "playerTurn" : "botTurn"} 
          color={currentWasmPlayer === humanPlayerPiece ? PLAYER_RED_COLOR : BOT_THINKING_COLOR}
        />, 
        currentWasmPlayer === humanPlayerPiece ? PLAYER_RED_COLOR : BOT_THINKING_COLOR
      );
      setIsPlayerTurn(currentWasmPlayer === humanPlayerPiece);
    }
  };

  const makeAIMove = async () => {
    if (!game || !isGameReady || game.isGameOver() || isPlayerTurn || isThinking) return;

    const startingResetTrigger = currentResetTriggerRef.current;

    setIsThinking(true);
    onBotThinkingStart();
    onStatusChange(
      <GameStatusDisplay 
        statusKey="botTurn" 
        color={PLAYER_YELLOW_COLOR} 
      />, 
      PLAYER_YELLOW_COLOR
    );
    
    await new Promise((resolve) => setTimeout(resolve, 100)); // Brief pause for UI update

    try {
      const params = aiMode === "time"
        ? { timeLimitMs: thinkingTime * 1000, uctC: uctParameter }
        : { maxSimulations: simulationCount, uctC: uctParameter };
      
      const chosenAiMove = await game.aiMove(params);

      if (startingResetTrigger !== currentResetTriggerRef.current) {
        // console.log("Game was reset during AI move calculation (ConnectFour), ignoring result.");
        return;
      }
      
      if (game && typeof chosenAiMove === 'number') {
        game.makeMove(chosenAiMove);
      } else {
        console.warn(`ConnectFour: AI worker returned an invalid or null move, or game state changed. Move: ${JSON.stringify(chosenAiMove)}, Game Status: ${game?.getStatus()}`);
      }
      
      updateGameStateFromWasm();

    } catch (error) {
      console.error("Error during AI move (WASM ConnectFour):", error);
      if (startingResetTrigger === currentResetTriggerRef.current) {
        const errorMsg = game ? `AI error - Your turn (${humanPlayerPiece === "red" ? "Red" : "Yellow"}) 🔴` : "AI error occurred.";
        onStatusChange(
          <GameStatusDisplay 
            statusKey="error" 
            message={errorMsg}
            color={PLAYER_RED_COLOR} 
          />, 
          PLAYER_RED_COLOR
        );
        setIsPlayerTurn(true); // Give turn back to player on AI error
      }
    } finally {
      if (startingResetTrigger === currentResetTriggerRef.current) {
        setIsThinking(false);
        onBotThinkingEnd();
      }
    }
  };

  const handleColumnClick = (colIndex: number) => {
    if (!isGameReady || !game || !isPlayerTurn || board[0][colIndex] !== "" || winner || isThinking || game.isGameOver()) {
      // Column full, not player's turn, game over, or AI thinking
      return;
    }

    try {
      game.makeMove(colIndex);
      updateGameStateFromWasm();
      
      // If game not over and it became AI's turn
      if (!game.isGameOver() && game.getCurrentPlayer() === aiPlayerPiece) {
         setIsPlayerTurn(false); // This will trigger useEffect for AI move
      }

    } catch (error) {
        console.error("Error making player move (WASM ConnectFour):", error);
        onStatusChange(
          <GameStatusDisplay 
            statusKey="error" 
            message={`Move error! Try again. 🧐 (${humanPlayerPiece === "red" ? "Red" : "Yellow"})`} 
            color={PLAYER_RED_COLOR} 
          />, 
          PLAYER_RED_COLOR
        );
        updateGameStateFromWasm(); 
    }
  };

  const handleColumnHover = (colIndex: number) => {
    if (!isPlayerTurn || winner || isThinking || !isGameReady || (game && game.isGameOver()) || (board[0] && board[0][colIndex] !== "")) {
      setPreviewCell(null);
      return;
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r] && board[r][colIndex] === "") {
        setPreviewCell({ row: r, col: colIndex });
        return;
      }
    }
    setPreviewCell(null);
  };

  const isWinningCell = (rowIndex: number, colIndex: number): boolean => {
    if (!winningLine) return false;
    return winningLine.some(cell => cell.row === rowIndex && cell.col === colIndex);
  };

  if (!isGameReady) {
    return (
      <div className="flex flex-col items-center justify-center w-full max-w-md p-4 bg-gray-800 rounded-lg shadow-xl" style={{minHeight: '400px'}}>
        <GameStatusDisplay statusKey="loading" color="#ecf0f1" />
        <p className="text-white mt-3">Initializing Connect Four Engine...</p>
      </div>
    );
  }

  // Calculate a dynamic width for the game board container based on COLS
  const boardContainerWidth = COLS * 4 + "rem"; // Roughly (COLS * (md:w-16)) ; 1rem = 16px so 4rem = 64px

  return (
    <div className="flex flex-col items-center space-y-4">
      <div className="w-[336px] h-[336px] flex items-center justify-center">
        <div className="bg-blue-600 p-2 rounded-lg">
          {board.map((row, rowIndex) => (
            <div key={rowIndex} className="flex">
              {row.map((cell, colIndex) => (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className="w-10 h-10 bg-blue-800 m-1 rounded-full flex items-center justify-center overflow-hidden"
                >
                  { (board[rowIndex][colIndex] || (previewCell && previewCell.row === rowIndex && previewCell.col === colIndex)) && (
                    <div
                      className={`w-8 h-8 rounded-full ${
                        previewCell && previewCell.row === rowIndex && previewCell.col === colIndex && board[rowIndex][colIndex] === ""
                          ? humanPlayerPiece === "red" ? "bg-red-500 opacity-50" : "bg-yellow-400 opacity-50"
                          : board[rowIndex][colIndex] === "red" ? "bg-red-500" : board[rowIndex][colIndex] === "yellow" ? "bg-yellow-400" : ""
                      } ${
                        isWinningCell(rowIndex, colIndex)
                          ? "ring-2 ring-white ring-offset-1 ring-offset-blue-800 [animation:pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] scale-110"
                          : ""
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}

          <div className="flex mt-2">
            {Array(COLS)
              .fill(null)
              .map((_, colIndex) => {
                const columnIsFull = board[0][colIndex] !== "";
                const gameIsOverOrNotReady = !!winner || !isGameReady || (game ? game.isGameOver() : false);
                const canPlayerCurrentlyInteract = isPlayerTurn && !isThinking;
                const isInteractable = canPlayerCurrentlyInteract && !gameIsOverOrNotReady && !columnIsFull;
                
                let buttonBaseClasses = "w-10 h-8 m-1 rounded-md flex items-center justify-center text-xl font-bold text-slate-800";
                let buttonDynamicClasses = "";

                if (isInteractable) {
                  buttonDynamicClasses = "bg-blue-500 hover:bg-blue-400 cursor-pointer";
                } else {
                  buttonDynamicClasses = "bg-blue-500 cursor-not-allowed";
                   if (columnIsFull || gameIsOverOrNotReady || (!isPlayerTurn && !isThinking)) {
                    buttonDynamicClasses += " opacity-50";
                  }
                }

                return (
                  <button
                    key={`button-${colIndex}`}
                    className={`${buttonBaseClasses} ${buttonDynamicClasses}`}
                    onClick={() => handleColumnClick(colIndex)}
                    onMouseEnter={() => handleColumnHover(colIndex)}
                    onMouseLeave={() => setPreviewCell(null)}
                    disabled={!isInteractable}
                    title={`Drop piece in column ${colIndex + 1}`}
                  >
                    ↓
                  </button>
                );
            })}
          </div>
        </div>
      </div>

      {gameOver && game && game.isGameOver() && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={onReset} // Use the onReset prop
            className={`
              ${ winner === humanPlayerPiece // Player Win (red)
                  ? "bg-[#2ecc71] hover:bg-[#27ae60]" // green theme
                  : winner === aiPlayerPiece // Bot Win (yellow)
                    ? "bg-[#E11D48] hover:bg-[#BE123C]" // red theme
                    : "bg-[#f39c12] hover:bg-[#e67e22]" // Draw: orange theme
              }
              text-white font-bold py-3 px-6 rounded-lg shadow-md hover:translate-y-[-2px] active:translate-y-[1px] transition-all text-lg
            `}
          >
            New Game
          </Button>
        </div>
      )}
    </div>
  );
}
