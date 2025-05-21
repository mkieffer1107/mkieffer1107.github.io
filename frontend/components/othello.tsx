"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { OthelloGame, OthelloBoardCell, AiMoveParams } from "@/lib/othello-game" // Added OthelloBoardCell, AiMoveParams
import GameStatusDisplay from "./game-status-display"; // Assuming this is needed like in TTT for status updates
import type { JSX } from "react"

interface OthelloProps {
  aiMode: "time" | "simulations"
  thinkingTime: number
  simulationCount: number
  uctParameter: number // uctParameter is used by GameEngine's aiMove
  onGameOver: (isOver: boolean) => void
  resetTrigger: number
  gameOver: boolean
  onReset: () => void
  onStatusChange: (status: string | JSX.Element, color?: string) => void
  onBotThinkingStart: () => void
  onBotThinkingEnd: () => void
}

// Define colors for different states
const PLAYER_PIECE_COLOR_NAME = 'Black'; // Player is Black
const BOT_PIECE_COLOR_NAME = 'White';   // Bot is White

const PLAYER_STATUS_COLOR = "#2c3e50" // Dark blue for player (Black pieces)
const BOT_STATUS_COLOR = "#1abc9c"    //
const WIN_COLOR = "#27ae60"           // Green for player win
const LOSE_COLOR = "#c0392b"          // Red for player loss
const DRAW_COLOR = "#f39c12"          // Orange/yellow for draw
const LOADING_COLOR = "#3498db";
const ERROR_COLOR = "#e74c3c";

export default function Othello({
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
}: OthelloProps) {
  const [game, setGame] = useState<OthelloGame | null>(null)
  const gameRef = useRef<OthelloGame | null>(null); // Stable ref for game object

  const [board, setBoard] = useState<OthelloBoardCell[][]>([])
  const [legalMoves, setLegalMoves] = useState<[number, number][]>([])
  const [isPlayerTurn, setIsPlayerTurn] = useState(true) // Player (Black) starts
  const [isThinking, setIsThinking] = useState(false)
  const [winner, setWinner] = useState<'Black' | 'White' | 'draw' | null>(null)
  const [score, setScore] = useState<{ black: number; white: number }>({ black: 2, white: 2 })
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null)
  const [isGameReady, setIsGameReady] = useState(false)

  const currentResetTriggerRef = useRef(resetTrigger)
  const isMountedRef = useRef(true)
  // const isAiProcessingRef = useRef(false) // Replaced by isThinking for simplicity with engine.aiMove

  // Update gameRef whenever game state changes
  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  const cancelAI = useCallback(() => {
    if (isMountedRef.current) {
      setIsThinking(false);
      onBotThinkingEnd(); // Ensure this is called
      // Check current player using gameRef if needed, though this cancel is mostly about UI state
      // if (gameRef.current && gameRef.current.getCurrentPlayer() === BOT_PIECE_COLOR_NAME) {
      //   // Avoid directly changing turn here as it might conflict with game logic flow
      // }
    }
    // console.log("cancelAI called. Current isThinking (after setIsThinking(false)): false");
  }, [onBotThinkingEnd]); // Removed game and isThinking from deps, relies on isThinking state directly via setIsThinking

  // Effect for initializing and resetting the game
  useEffect(() => {
    currentResetTriggerRef.current = resetTrigger;
    // console.log(`[Othello.tsx] resetTrigger useEffect: Triggered with value ${resetTrigger}. Calling initializeGame.`);
    initializeGame();

    // Cleanup for the game instance when resetTrigger changes OR component unmounts
    // This specifically handles the old game instance being freed when a new one is created by reset.
    return () => {
      if (gameRef.current) {
        // console.log(`[Othello.tsx] resetTrigger useEffect cleanup: Freeing game instance (ID: ${gameRef.current['instanceId']}) due to reset or unmount.`);
        gameRef.current.free();
        gameRef.current = null; // Clear the ref after freeing
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetTrigger]); // Only resetTrigger as dependency

  // Effect for component mount/unmount status
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      // console.log("[Othello.tsx] Component unmounting. Setting isMountedRef to false.");
      isMountedRef.current = false;
      // The main game cleanup for unmount is now handled by the resetTrigger useEffect's cleanup
      // if the resetTrigger is what unmounts/replaces the component, or if no reset trigger involved,
      // the game created by initializeGame will be freed if component is simply removed.
      // Ensure any pending AI operation is cancelled if the component unmounts while AI is thinking.
      // This might be redundant if cancelAI is also in game.free() or similar,
      // but good for component-level cleanup.
      if (gameRef.current && isThinking) { // Check gameRef.current specifically
          // console.log("[Othello.tsx] Unmount: AI is thinking, attempting to cancel.");
          // gameRef.current.cancelAiThinking(); // Hypothetical method on game instance
          cancelAI(); // Use existing cancelAI which updates component state
      }
    };
  }, [isThinking, cancelAI]); // Added isThinking and cancelAI to dependencies to ensure cancel is fresh


  const initializeGame = async () => {
    // console.log("[Othello.tsx] initializeGame: Called");
    const forResetCycle = currentResetTriggerRef.current; // Capture reset cycle at the start of this specific invocation

    setIsGameReady(false)
    if (typeof onStatusChange === 'function') {
      onStatusChange(<GameStatusDisplay statusKey="loading" color={LOADING_COLOR} />, LOADING_COLOR)
    } else {
      console.warn("Othello.tsx: onStatusChange is not a function during initializeGame (loading status).");
    }
    
    // The useEffect for resetTrigger should ideally handle freeing the *previous* game instance.
    // This block ensures that if initializeGame is called and gameRef.current still holds an old instance, it's freed.
    // This might be redundant if resetTrigger's cleanup is reliable, but acts as a safeguard.
    if (gameRef.current) {
      // console.warn(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): gameRef.current was not null. Freeing existing instance (ID: ${gameRef.current['instanceId']}).`);
      // This free should ideally be for the instance associated with a *previous* cycle.
      // The main `useEffect[resetTrigger]` cleanup handles freeing the game instance tied to the *previous* `resetTrigger` value.
      // Direct call here might be risky if it frees the instance meant for the *current* cycle if not careful.
      // Let's rely on the useEffect cleanup and only nullify refs/state here.
    }
    // Safely nullify references and state before creating a new game.
    gameRef.current = null; 
    setGame(null); 
    
    if (isThinking) {
        // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): Cancelling AI as part of game initialization.`);
        cancelAI();
    }

    const newGameInstance = new OthelloGame()
    // Assign to gameRef.current immediately. This is critical.
    // If this initializeGame call becomes stale, this ref will be overwritten by the newer call.
    gameRef.current = newGameInstance;
    // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): Created new OthelloGame instance (ID: ${newGameInstance['instanceId']}). Assigned to gameRef.current.`);
    
    try {
      // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): Calling newGameInstance.initialize().`);
      await newGameInstance.initialize()
      // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): newGameInstance.initialize() completed.`);
      
      if (!isMountedRef.current || currentResetTriggerRef.current !== forResetCycle) {
        console.log(`[Othello.tsx] initializeGame: Aborting stale initialization for cycle ${forResetCycle} (current is ${currentResetTriggerRef.current}, mounted: ${isMountedRef.current}). Freeing new instance (ID: ${newGameInstance['instanceId']}).`);
        newGameInstance.free();
        // If this was the instance in gameRef.current, and this call is stale, the newer call would have already updated gameRef.current.
        // Avoid nullifying gameRef.current here if it might belong to the active cycle.
        // if (gameRef.current === newGameInstance) { gameRef.current = null; } // This might be too aggressive
        return;
      }
      // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): New game instance (ID: ${newGameInstance['instanceId']}) initialized successfully and is current.`);
      
      setGame(newGameInstance) 
      updateBoardAndScoresFromGame(newGameInstance)
      setLegalMoves(newGameInstance.getValidMoves())
      
      const initialPlayer = newGameInstance.getCurrentPlayer()
      setIsPlayerTurn(initialPlayer === PLAYER_PIECE_COLOR_NAME)
      setWinner(null) // Explicitly reset winner state
      onGameOver(false) // Explicitly reset parent's game over state
      setIsGameReady(true) 
      // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): Set isGameReady to true.`);

      updateStatusDisplay(newGameInstance);

      if (initialPlayer === BOT_PIECE_COLOR_NAME && !newGameInstance.isGameOver()) {
        // console.log(`[Othello.tsx] initializeGame (cycle ${forResetCycle}): Bot's turn. Setting isPlayerTurn to false.`);
        setIsPlayerTurn(false); 
      }

    } catch (error) {
      console.error(`[Othello.tsx] Failed to initialize Othello WASM game (cycle ${forResetCycle}):`, error)
      
      if (!isMountedRef.current || currentResetTriggerRef.current !== forResetCycle) {
        console.warn(`[Othello.tsx] initializeGame: Error occurred in a stale initialization cycle ${forResetCycle}. Current cycle is ${currentResetTriggerRef.current}. Error:`, error);
        newGameInstance.free(); // Free the instance from this stale, failed cycle.
        return;
      }

      // Error is for the current cycle
      if (typeof onStatusChange === 'function') {
        onStatusChange(<GameStatusDisplay statusKey="error" color={ERROR_COLOR} message="Error loading Othello! 😭 Please refresh."/>, ERROR_COLOR)
      } else {
        console.warn("Othello.tsx: onStatusChange is not a function during initializeGame (error status).");
      }
      newGameInstance.free(); 
      if (gameRef.current === newGameInstance) { 
        gameRef.current = null;
      }
      setGame(null) 
      // isGameReady remains false, set at the start of initializeGame.
    }
  }
  
  const updateBoardAndScoresFromGame = (currentGameInstance: OthelloGame | null) => {
    if (!currentGameInstance) {
      console.warn("[Othello.tsx] updateBoardAndScoresFromGame: currentGameInstance is null");
      return;
    }
    // console.log(`[Othello.tsx] updateBoardAndScoresFromGame (Instance ID: ${currentGameInstance['instanceId']}): Updating board and scores.`);
    const newBoardData = currentGameInstance.getBoard();
    const newScoresData = currentGameInstance.getScores();
    // console.log("[Othello.tsx] updateBoardAndScoresFromGame: Raw board data from game:", newBoardData);
    // console.log("[Othello.tsx] updateBoardAndScoresFromGame: Raw scores data from game:", newScoresData);

    setBoard(newBoardData?.rows || [])
    if (newScoresData) {
      setScore(newScoresData)
    }
  }

  const updateStatusDisplay = (currentGameInstance: OthelloGame | null) => {
    if (!currentGameInstance) {
      console.warn("[Othello.tsx] updateStatusDisplay: currentGameInstance is null");
      return;
    }
    // console.log(`[Othello.tsx] updateStatusDisplay (Instance ID: ${currentGameInstance['instanceId']}): Updating status. Current Wasm Player:`, currentGameInstance.getCurrentPlayer(), "Is Game Over:", currentGameInstance.isGameOver(), "Winner:", currentGameInstance.getWinner());
    if (typeof onStatusChange !== 'function') {
      console.warn("Othello.tsx: onStatusChange is not a function in updateStatusDisplay.");
      return;
    }

    const gameWinner = currentGameInstance.getWinner();
    const currentWasmPlayer = currentGameInstance.getCurrentPlayer();

    if (gameWinner) {
      setWinner(gameWinner);
      if (gameWinner === "draw") {
        onStatusChange(<GameStatusDisplay statusKey="draw" color={DRAW_COLOR} />, DRAW_COLOR)
      } else if (gameWinner === PLAYER_PIECE_COLOR_NAME) {
        onStatusChange(<GameStatusDisplay statusKey="playerWin" color={WIN_COLOR} />, WIN_COLOR)
      } else { 
        onStatusChange(<GameStatusDisplay statusKey="botWin" color={LOSE_COLOR} />, LOSE_COLOR)
      }
      setIsPlayerTurn(false); 
    } else if (currentGameInstance.isGameOver()){ 
        onStatusChange(<GameStatusDisplay statusKey="draw" message="Game Over - No moves left!" color={DRAW_COLOR} />, DRAW_COLOR);
        setIsPlayerTurn(false);
    }
    else { 
      onStatusChange(
        <GameStatusDisplay 
          statusKey={currentWasmPlayer === PLAYER_PIECE_COLOR_NAME ? "playerTurn" : "botTurn"}
          color={currentWasmPlayer === PLAYER_PIECE_COLOR_NAME ? PLAYER_STATUS_COLOR : BOT_STATUS_COLOR}
        />, 
        currentWasmPlayer === PLAYER_PIECE_COLOR_NAME ? PLAYER_STATUS_COLOR : BOT_STATUS_COLOR
      );
      setIsPlayerTurn(currentWasmPlayer === PLAYER_PIECE_COLOR_NAME);
    }
  }


  useEffect(() => {
    // Use gameRef.current for checks inside this effect to ensure stability against game object recreation
    if (isGameReady && gameRef.current && !isPlayerTurn && !winner && !gameRef.current.isGameOver() && !isThinking) {
      // console.log("[Othello.tsx] AI Turn useEffect: Conditions met, calling makeAIMove.");
      makeAIMove()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGameReady, isPlayerTurn, winner, isThinking]) // gameRef.current is stable, game (state) is not needed here

  useEffect(() => {
    if (winner !== null) {
      onGameOver(true)
    }
  }, [winner, onGameOver])

  useEffect(() => {
    if (gameOver && gameRef.current && !gameRef.current.isGameOver()) {
        // console.log("Othello: Parent gameOver is true, but local game not over. Reset should handle this.");
    }
    if (!gameOver && winner !== null) {
        // console.log("Othello: Parent gameOver is false, but local winner exists. Reset should handle this.");
    }
  }, [gameOver, winner]); // gameRef.current not needed here as it's about reacting to props


  const makeAIMove = async () => {
    const currentGameInstance = gameRef.current; // Use the stable ref for the whole AI move operation
    // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance ? currentGameInstance['instanceId'] : 'N/A'}): Called.`);
    
    if (!currentGameInstance || !isGameReady || isPlayerTurn || winner || currentGameInstance.isGameOver() || isThinking) {
      // console.log("[Othello.tsx] makeAIMove: Aborted due to conditions. Game instance exists:", !!currentGameInstance, "isGameReady:", isGameReady, "isPlayerTurn:", isPlayerTurn, "winner:", winner, "isGameOver:", currentGameInstance ? currentGameInstance.isGameOver() : 'N/A', "isThinking:", isThinking);
      return
    }

    const startingResetTrigger = currentResetTriggerRef.current;
    // console.log("[Othello.tsx] makeAIMove: Starting AI move. Reset trigger:", startingResetTrigger);
    setIsThinking(true)
    onBotThinkingStart()
    updateStatusDisplay(currentGameInstance); 

    await new Promise((resolve) => setTimeout(resolve, 100))

    try {
      const params: AiMoveParams = aiMode === "time"
        ? { timeLimitMs: thinkingTime * 1000, uctC: uctParameter }
        : { maxSimulations: simulationCount, uctC: uctParameter };
      
      // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): Calling currentGameInstance.aiMove with params:`, params);
      const aiChosenMove = await currentGameInstance.aiMove(params);
      // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): currentGameInstance.aiMove completed. AI chose:`, aiChosenMove);

      if (!isMountedRef.current || startingResetTrigger !== currentResetTriggerRef.current) {
        // console.log("[Othello.tsx] makeAIMove: Game was reset or component unmounted during AI move calculation, ignoring result.");
        // setIsThinking(false) and onBotThinkingEnd() will be called in finally
        return;
      }

      if (aiChosenMove && typeof aiChosenMove.row === 'number' && typeof aiChosenMove.col === 'number') {
        // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): Applying AI chosen move (${aiChosenMove.row}, ${aiChosenMove.col}) to the game.`);
        currentGameInstance.makeMove(aiChosenMove.row, aiChosenMove.col);
        // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): AI move applied.`);
      } else {
        console.error(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): AI did not return a valid move. Received:`, aiChosenMove);
        throw new Error("AI did not return a valid move.");
      }
      
      // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): Updating board and scores after AI move.`);
      updateBoardAndScoresFromGame(currentGameInstance);
      const newLegalMoves = currentGameInstance.getValidMoves();
      // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): New legal moves after AI:`, newLegalMoves);
      setLegalMoves(newLegalMoves);
      
      const gameWinner = currentGameInstance.getWinner();
      // console.log(`[Othello.tsx] makeAIMove (Instance ID: ${currentGameInstance['instanceId']}): Winner after AI move:`, gameWinner, "Is Game Over:", currentGameInstance.isGameOver());
      if (gameWinner) {
        setWinner(gameWinner);
        onGameOver(true);
      } else if (currentGameInstance.isGameOver()) {
        onGameOver(true);
      }
      
      updateStatusDisplay(currentGameInstance);

    } catch (error) {
      console.error(`[Othello.tsx] Error during Othello AI move (Instance ID: ${currentGameInstance ? currentGameInstance['instanceId'] : 'N/A'}):`, error);
      if (isMountedRef.current && startingResetTrigger === currentResetTriggerRef.current) {
        if (typeof onStatusChange === 'function') {
          onStatusChange(
              <GameStatusDisplay statusKey="playerTurn" message="AI error - Player (Black) turn 🫵" color={PLAYER_STATUS_COLOR}/>, 
              PLAYER_STATUS_COLOR
          );
        } else {
          console.warn("Othello.tsx: onStatusChange is not a function during AI error recovery.");
        }
        setIsPlayerTurn(true);
      }
    } finally {
      if (isMountedRef.current && startingResetTrigger === currentResetTriggerRef.current) {
        // console.log(`[Othello.tsx] makeAIMove finally block (Instance ID: ${currentGameInstance ? currentGameInstance['instanceId'] : 'N/A'}). Setting isThinking to false.`);
        setIsThinking(false)
        onBotThinkingEnd()
      } else {
        // console.log(`[Othello.tsx] makeAIMove finally block: Not current cycle or unmounted. (startingResetTrigger: ${startingResetTrigger}, currentResetTriggerRef.current: ${currentResetTriggerRef.current}, isMounted: ${isMountedRef.current})`);
        // Potentially, if isThinking was true for this stale/unmounted operation, ensure onBotThinkingEnd() was called or state is otherwise clean.
        // However, cancelAI in initializeGame should handle isThinking for new games.
      }
    }
  }

  const handleCellClick = (row: number, col: number) => {
    const currentGameInstance = gameRef.current; // Use stable ref
    // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance ? currentGameInstance['instanceId'] : 'N/A'}): Clicked on cell (${row}, ${col}).`);
    
    if (!isGameReady || !currentGameInstance || !isPlayerTurn || winner || isThinking || currentGameInstance.isGameOver()) {
      // console.log("[Othello.tsx] handleCellClick: Aborted due to conditions. Game instance exists:", !!currentGameInstance, "isGameReady:", isGameReady, "isPlayerTurn:", isPlayerTurn, "winner:", winner, "isThinking:", isThinking, "isGameOver:", currentGameInstance ? currentGameInstance.isGameOver() : 'N/A');
      return
    }

    if (!isLegalMove(row, col)) {
      // console.log(`[Othello.tsx] handleCellClick: Clicked on non-legal move (${row}, ${col}). Current legal moves:`, legalMoves);
      return
    }

    try {
      // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance['instanceId']}): Making move for player at (${row}, ${col}).`);
      currentGameInstance.makeMove(row, col)
      // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance['instanceId']}): game.makeMove completed.`);
      
      // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance['instanceId']}): Updating board and scores after player move.`);
      updateBoardAndScoresFromGame(currentGameInstance)
      const newLegalMoves = currentGameInstance.getValidMoves();
      // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance['instanceId']}): New legal moves after player move:`, newLegalMoves);
      setLegalMoves(newLegalMoves)

      const gameWinner = currentGameInstance.getWinner();
      // console.log(`[Othello.tsx] handleCellClick (Instance ID: ${currentGameInstance['instanceId']}): Winner after player move:`, gameWinner, "Is Game Over:", currentGameInstance.isGameOver());

      if (gameWinner) {
        setWinner(gameWinner);
        onGameOver(true);
      } else if (currentGameInstance.isGameOver()) {
        onGameOver(true);
      } 
      updateStatusDisplay(currentGameInstance);

    } catch (error) {
        console.error(`[Othello.tsx] Error making player move (Instance ID: ${currentGameInstance ? currentGameInstance['instanceId'] : 'N/A'}):`, error);
        if (typeof onStatusChange === 'function') {
          onStatusChange(<GameStatusDisplay statusKey="error" message="Move error! Try again. 🧐" color={ERROR_COLOR}/>, ERROR_COLOR)
        } else {
          console.warn("Othello.tsx: onStatusChange is not a function during player move error.");
        }
        if (currentGameInstance) { // Check if instance is still valid before trying to update from it
            updateBoardAndScoresFromGame(currentGameInstance);
            setLegalMoves(currentGameInstance.getValidMoves());
            updateStatusDisplay(currentGameInstance);
        }
    }
  }

  const handleMouseEnter = (row: number, col: number) => {
    setHoveredCell({ row, col })
  }

  const handleMouseLeave = () => {
    setHoveredCell(null)
  }

  const isLegalMove = (row: number, col: number): boolean => {
    const currentGameInstance = gameRef.current;
    if (!isPlayerTurn || winner || isThinking || !currentGameInstance || currentGameInstance.isGameOver()) return false;
    return legalMoves.some((move) => move[0] === row && move[1] === col)
  }

  const shouldShowClickCursor = (row: number, col: number): boolean => {
    return isLegalMove(row, col)
  }

  if (!isGameReady || !gameRef.current) { // Check gameRef.current for readiness
    return (
      <div className="flex flex-col items-center justify-center w-[336px] h-[336px] bg-[#34495e] rounded-lg p-4">
        <GameStatusDisplay statusKey="loading" color="#ecf0f1" />
        <p className="text-white mt-2">Initializing Othello Engine...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-[336px] h-[336px] flex flex-col items-center justify-center">
        <div className="flex justify-between w-full mb-2 px-2">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-black rounded-full mr-2"></div>
            <span className="font-medium text-black">{score.black}</span>
          </div>
          <div className="flex items-center">
            <span className="font-medium text-black">{score.white}</span>
            <div className="w-4 h-4 bg-white border border-gray-500 rounded-full ml-2"></div>
          </div>
        </div>
        <div className="grid grid-cols-8 bg-green-700 border-2 border-gray-800">
          {board.map((boardRow, rowIndex) =>
            boardRow.map((cell, colIndex) => (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`w-10 h-10 border border-green-800 relative flex items-center justify-center
                  ${shouldShowClickCursor(rowIndex, colIndex) ? "cursor-pointer" : "cursor-default"}
                `}
                onClick={() => handleCellClick(rowIndex, colIndex)}
                onMouseEnter={() => handleMouseEnter(rowIndex, colIndex)}
                onMouseLeave={handleMouseLeave}
              >
                {cell.player && (
                  <div
                    className={`w-8 h-8 rounded-full
                      ${cell.player === 'Black' ? "bg-black" : "bg-white border-2 border-gray-400"}
                    `}
                  />
                )}
                {isLegalMove(rowIndex, colIndex) && (
                  <div
                    className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full 
                    ${
                      hoveredCell?.row === rowIndex && hoveredCell?.col === colIndex
                        ? (PLAYER_PIECE_COLOR_NAME === 'Black' ? "bg-black opacity-50" : "bg-white opacity-50 border border-slate-700")
                        : (PLAYER_PIECE_COLOR_NAME === 'Black' ? "bg-black opacity-20" : "bg-white opacity-20 border border-slate-700")
                    }`}
                  />
                )}
              </div>
            )),
          )}
        </div>
      </div>
      { (winner || (gameRef.current && gameRef.current.isGameOver())) && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={onReset} 
            className={`
              ${
                winner === PLAYER_PIECE_COLOR_NAME
                  ? "bg-[#2ecc71] hover:bg-[#27ae60]"
                  : winner === BOT_PIECE_COLOR_NAME
                    ? "bg-[#E11D48] hover:bg-[#BE123C]"
                    : "bg-[#f39c12] hover:bg-[#e67e22]"
              }
              text-white font-bold py-3 px-6 rounded-lg shadow-md hover:translate-y-[-2px] active:translate-y-[1px] transition-all
            `}
          >
            New Game
          </Button>
        </div>
      )}
    </div>
  )
}
