"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { TicTacToeGame } from "@/lib/tic-tac-toe-game"
import GameStatusDisplay from "./game-status-display"
import type { JSX } from "react"

interface TicTacToeProps {
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

export default function TicTacToe({
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
}: TicTacToeProps) {
  const [game, setGame] = useState<TicTacToeGame | null>(null)
  const [board, setBoard] = useState<string[]>(Array(9).fill(""))
  const [isPlayerTurn, setIsPlayerTurn] = useState(true)
  const [isThinking, setIsThinking] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)
  const [winningLine, setWinningLine] = useState<number[] | null>(null)
  const [isGameReady, setIsGameReady] = useState(false)

  const currentResetTriggerRef = useRef(resetTrigger)

  const BOT_THINKING_COLOR = "#8e44ad"

  useEffect(() => {
    currentResetTriggerRef.current = resetTrigger
    let newGameInstance: TicTacToeGame | null = null

    const initializeGame = async () => {
      setIsGameReady(false)
      onStatusChange(<GameStatusDisplay statusKey="loading" color="#3498db" />, "#3498db")

      if (game) {
        // console.log("Freeing previous game instance during reset/init.")
        game.free()
      }
      
      newGameInstance = new TicTacToeGame()
      try {
        await newGameInstance.initialize()
        setGame(newGameInstance)
        setBoard(newGameInstance.getBoard())
        setIsPlayerTurn(newGameInstance.getCurrentPlayer() === "X")
        setWinner(null)
        setWinningLine(null)
        setIsThinking(false)
        onGameOver(false)
        setIsGameReady(true)
        const initialPlayer = newGameInstance.getCurrentPlayer();
        onStatusChange(
          <GameStatusDisplay 
            statusKey={initialPlayer === "X" ? "playerTurn" : "botTurn"} 
            color={initialPlayer === "X" ? "#2980b9" : BOT_THINKING_COLOR}
          />, 
          initialPlayer === "X" ? "#2980b9" : BOT_THINKING_COLOR
        );

        if (newGameInstance.getCurrentPlayer() === "O" && !newGameInstance.isGameOver()) {
          setIsPlayerTurn(false)
        }

      } catch (error) {
        console.error("Failed to initialize TicTacToe WASM game:", error)
        onStatusChange(<GameStatusDisplay statusKey="error" color="#e74c3c" message="Error loading game! 😭 Please refresh."/>, "#e74c3c")
        setGame(null)
      }
    }

    initializeGame()

    return () => {
      // console.log("TicTacToe component cleanup: Freeing WASM game instance.")
      if (newGameInstance) {
        newGameInstance.free()
      } else if (game) {
        game.free()
      }
      setGame(null)
    }
  }, [resetTrigger])

  useEffect(() => {
    if (isGameReady && game && !isPlayerTurn && !winner && !game.isGameOver() && !isThinking) {
      makeAIMove()
    }
  }, [isGameReady, game, isPlayerTurn, winner, isThinking])

  useEffect(() => {
    if (winner !== null) {
      onGameOver(true)
    }
  }, [winner, onGameOver])

  useEffect(() => {
    if (!gameOver && winner !== null) {
      // console.log("Parent indicated gameOver is false, but local winner exists. Consider using resetTrigger.")
    }
  }, [gameOver])

  const updateGameStateFromWasm = () => {
    if (!game) return

    const newBoard = game.getBoard()
    const gameWinner = game.getWinner()
    const currentWasmPlayer = game.getCurrentPlayer()
    
    setBoard(newBoard)

    if (gameWinner) {
      setWinner(gameWinner)
      setWinningLine(game.getWinningLine())
      if (gameWinner === "draw") {
        onStatusChange(<GameStatusDisplay statusKey="draw" color="#f39c12" />, "#f39c12")
      } else if (gameWinner === "X") {
        onStatusChange(<GameStatusDisplay statusKey="playerWin" color="#27ae60" />, "#27ae60")
      } else {
        onStatusChange(<GameStatusDisplay statusKey="botWin" color="#c0392b" />, "#c0392b")
      }
      setIsPlayerTurn(false)
    } else {
      onStatusChange(
        <GameStatusDisplay 
          statusKey={currentWasmPlayer === "X" ? "playerTurn" : "botTurn"} 
          color={currentWasmPlayer === "X" ? "#2980b9" : BOT_THINKING_COLOR}
        />, 
        currentWasmPlayer === "X" ? "#2980b9" : BOT_THINKING_COLOR
      )
      setIsPlayerTurn(currentWasmPlayer === "X")
    }
  }

  const makeAIMove = async () => {
    if (!game || !isGameReady || isPlayerTurn || winner || game.isGameOver() || isThinking) return

    const startingResetTrigger = currentResetTriggerRef.current

    setIsThinking(true)
    onBotThinkingStart()
    onStatusChange(
      <GameStatusDisplay 
        statusKey="botTurn" 
        color={BOT_THINKING_COLOR} 
      />, 
      BOT_THINKING_COLOR
    )
    
    await new Promise((resolve) => setTimeout(resolve, 100))

    try {
      const params = aiMode === "time"
        ? { timeLimitMs: thinkingTime * 1000, uctC: uctParameter }
        : { maxSimulations: simulationCount, uctC: uctParameter }
      
      const chosenAiMove = await game.aiMove(params)

      if (startingResetTrigger !== currentResetTriggerRef.current) {
        // console.log("Game was reset during AI move calculation (TicTacToe), ignoring result.")
        return
      }
      
      if (game && chosenAiMove && typeof chosenAiMove.index === 'number') {
        game.makeMove(chosenAiMove.index)
      } else {
        console.warn(`TicTacToe: AI worker returned an invalid or null move, or game state changed. Move: ${JSON.stringify(chosenAiMove)}, Game Status: ${game?.getStatus()}`);
      }
      
      updateGameStateFromWasm()

    } catch (error) {
      console.error("Error during AI move (WASM):", error)
      if (startingResetTrigger === currentResetTriggerRef.current) {
        const errorMsg = game ? "AI error - Your turn 🫵" : "AI error occurred."
        onStatusChange(<GameStatusDisplay statusKey="playerTurn" message={errorMsg} color="#2980b9"/>, "#2980b9")
        setIsPlayerTurn(true)
      }
    } finally {
      if (startingResetTrigger === currentResetTriggerRef.current) {
        setIsThinking(false)
        onBotThinkingEnd()
      }
    }
  }

  const handleSquareClick = (index: number) => {
    if (!isGameReady || !game || !isPlayerTurn || board[index] !== "" || winner || isThinking || game.isGameOver()) {
      return
    }

    try {
      game.makeMove(index)
      updateGameStateFromWasm()
      
      if (!game.isGameOver() && game.getCurrentPlayer() === "O") {
         setIsPlayerTurn(false)
      }

    } catch (error) {
        console.error("Error making player move (WASM):", error)
        onStatusChange(<GameStatusDisplay statusKey="error" message="Move error! Try again. 🧐" color="#e74c3c"/>, "#e74c3c")
        updateGameStateFromWasm()
    }
  }

  const isWinningCell = (index: number) => winningLine !== null && winningLine.includes(index)

  const getCellBackgroundColor = (index: number, cellValue: string) => {
    if (isWinningCell(index)) {
      return cellValue === "X" ? "bg-green-200 hover:bg-green-300" : "bg-red-200 hover:bg-red-300"
    }
    return "bg-[#ecf0f1] hover:bg-[#dcdde1]"
  }
  
  if (!isGameReady) {
    return (
      <div className="flex flex-col items-center justify-center w-[336px] h-[336px] bg-[#34495e] rounded-lg p-4">
        <GameStatusDisplay statusKey="loading" color="#ecf0f1" />
        <p className="text-white mt-2">Initializing Game Engine...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center">
      <div className="w-[336px] h-[336px] flex items-center justify-center">
        <div className="grid grid-cols-3 gap-2 p-2 bg-[#34495e] rounded-lg">
          {board.map((cell, index) => (
            <button
              key={index}
              onClick={() => handleSquareClick(index)}
              disabled={!isPlayerTurn || cell !== "" || !!winner || isThinking || !isGameReady || (game ? game.isGameOver() : true) }
              className={`
                w-[100px] h-[100px] flex items-center justify-center text-[3.5em] font-bold
                ${getCellBackgroundColor(index, cell)}
                ${cell === "X" ? "text-[#2980b9]" : cell === "O" ? "text-[#8e44ad]" : "text-[#1E1B63]"}
                rounded-md transition-colors
              `}
            >
              {cell}
            </button>
          ))}
        </div>
      </div>

      {gameOver && game && game.isGameOver() && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={() => {
                onReset()
            }}
            className={`
        ${
          winner === "X"
            ? "bg-[#2ecc71] hover:bg-[#27ae60]"
            : winner === "O"
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
