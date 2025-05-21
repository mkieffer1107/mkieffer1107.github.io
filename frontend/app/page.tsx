"use client"

import { useState, useEffect, useRef } from "react"
import TicTacToe from "@/components/tic-tac-toe"
import ConnectFour from "@/components/connect-four"
import GameSelector from "@/components/game-selector"
import AISettings from "@/components/ai-settings"
import Checkers from "@/components/checkers"
import Othello from "@/components/othello"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { JSX } from "react"

export default function Home() {
  const [currentGame, setCurrentGame] = useState<"tic-tac-toe" | "connect-four" | "othello" | "checkers">("tic-tac-toe")
  const [aiMode, setAiMode] = useState<"time" | "simulations">("time")
  const [thinkingTime, setThinkingTime] = useState(1.5)
  const [simulationCount, setSimulationCount] = useState(1000)
  const [uctParameter, setUctParameter] = useState(Math.sqrt(2)) // Default to sqrt(2)
  const [showSettings, setShowSettings] = useState(false)
  const [isSettingsClosing, setIsSettingsClosing] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const [resetTrigger, setResetTrigger] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const [gameStatus, setGameStatus] = useState<string | JSX.Element>("Your turn 🫵")
  const [statusColor, setStatusColor] = useState<string | undefined>(undefined)
  const [isBotThinking, setIsBotThinking] = useState(false) // New state to track if bot is thinking

  const [isMainResetHovered, setIsMainResetHovered] = useState(false); // Added for main reset hover
  const [isSettingsHovered, setIsSettingsHovered] = useState(false); // Added for settings hover

  // Use a ref to track if component has mounted
  const isMounted = useRef(false)

  // Detect mobile/desktop on mount and window resize
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }

    // Set initial value
    checkIfMobile()

    // Mark as mounted
    isMounted.current = true

    // Add resize listener
    window.addEventListener("resize", checkIfMobile)

    // Clean up
    return () => window.removeEventListener("resize", checkIfMobile)
  }, [])

  const handleGameOver = (isOver: boolean) => {
    setGameOver(isOver)
  }

  const handleReset = () => {
    // Allow reset even if bot is thinking
    // This will cancel any ongoing MCTS calculations
    setResetTrigger((prev) => prev + 1)
    setGameOver(false)
    setGameStatus("Your turn 🫵")
    setStatusColor(undefined)

    // If bot was thinking, reset that state
    if (isBotThinking) {
      setIsBotThinking(false)
    }
  }

  const handleGameChange = (newGame: "tic-tac-toe" | "connect-four" | "othello" | "checkers") => {
    // Allow game switching even if bot is thinking
    // This will cancel any ongoing MCTS calculations
    setCurrentGame(newGame)

    // Reset game state
    setResetTrigger((prev) => prev + 1)
    setGameOver(false)
    setGameStatus("Your turn 🫵")
    setStatusColor(undefined)

    // If bot was thinking, reset that state
    if (isBotThinking) {
      setIsBotThinking(false)
    }
  }

  const toggleSettings = () => {
    // For desktop: instant toggle without animations
    if (!isMobile) {
      setShowSettings(!showSettings)
      return
    }

    // For mobile: animated transitions
    if (showSettings) {
      // If we're closing the settings on mobile
      setIsSettingsClosing(true)
      // Wait for animation to complete before hiding
      setTimeout(() => {
        setShowSettings(false)
        setIsSettingsClosing(false)
      }, 200)
    } else {
      setShowSettings(true)
    }
  }

  const handleStatusChange = (status: string | JSX.Element, color?: string) => {
    setGameStatus(status)
    setStatusColor(color)
  }

  // New handlers for bot thinking state
  const handleBotThinkingStart = () => {
    setIsBotThinking(true)
  }

  const handleBotThinkingEnd = () => {
    setIsBotThinking(false)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-4 md:p-8 bg-[#f0f2f5]">
      <div className="relative flex flex-col items-center">
        {/* Main game container - fixed size */}
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg px-6">
          {/* Top header with buttons and status aligned */}
          <div className="h-14 flex items-center justify-between">
            <div className="w-8 flex items-center justify-center">
              <Button
                variant="outline"
                onClick={handleReset}
                title="Reset Game"
                className="icon-button"
                onMouseEnter={() => setIsMainResetHovered(true)}
                onMouseLeave={() => setIsMainResetHovered(false)}
              >
                <i className={`fas fa-sync-alt fa-spin ${isMainResetHovered ? "spin-active" : ""}`}></i>
              </Button>
            </div>

            {/* Game status in the center with dynamic color */}
            <div
              className="text-xl font-medium flex items-center justify-center"
              style={{ color: typeof gameStatus === "string" ? statusColor : undefined }}
            >
              {gameStatus}
            </div>

            <div className="w-8 flex items-center justify-center">
              <Button
                variant="outline"
                onClick={toggleSettings}
                title="Settings"
                className="icon-button"
                onMouseEnter={() => setIsSettingsHovered(true)}
                onMouseLeave={() => setIsSettingsHovered(false)}
              >
                <i className={`fas fa-cog fa-spin ${isSettingsHovered ? "spin-active" : ""}`}></i>
              </Button>
            </div>
          </div>

          {/* Game board container */}
          <div className="py-2 pb-6">
            <div className="flex justify-center">
              {currentGame === "tic-tac-toe" ? (
                <TicTacToe
                  aiMode={aiMode}
                  thinkingTime={thinkingTime}
                  simulationCount={simulationCount}
                  uctParameter={uctParameter}
                  onGameOver={handleGameOver}
                  resetTrigger={resetTrigger}
                  gameOver={gameOver}
                  onReset={handleReset}
                  onStatusChange={handleStatusChange}
                  onBotThinkingStart={handleBotThinkingStart}
                  onBotThinkingEnd={handleBotThinkingEnd}
                />
              ) : currentGame === "connect-four" ? (
                <ConnectFour
                  aiMode={aiMode}
                  thinkingTime={thinkingTime}
                  simulationCount={simulationCount}
                  uctParameter={uctParameter}
                  onGameOver={handleGameOver}
                  resetTrigger={resetTrigger}
                  gameOver={gameOver}
                  onReset={handleReset}
                  onStatusChange={handleStatusChange}
                  onBotThinkingStart={handleBotThinkingStart}
                  onBotThinkingEnd={handleBotThinkingEnd}
                />
              ) : currentGame === "othello" ? (
                <Othello
                  key={resetTrigger}
                  aiMode={aiMode}
                  thinkingTime={thinkingTime}
                  simulationCount={simulationCount}
                  uctParameter={uctParameter}
                  onGameOver={handleGameOver}
                  resetTrigger={resetTrigger}
                  gameOver={gameOver}
                  onReset={handleReset}
                  onStatusChange={handleStatusChange}
                  onBotThinkingStart={handleBotThinkingStart}
                  onBotThinkingEnd={handleBotThinkingEnd}
                />
              ) : (
                <Checkers
                  aiMode={aiMode}
                  thinkingTime={thinkingTime}
                  simulationCount={simulationCount}
                  uctParameter={uctParameter}
                  onGameOver={handleGameOver}
                  resetTrigger={resetTrigger}
                  gameOver={gameOver}
                  onReset={handleReset}
                  onStatusChange={handleStatusChange}
                  onBotThinkingStart={handleBotThinkingStart}
                  onBotThinkingEnd={handleBotThinkingEnd}
                />
              )}
            </div>
          </div>
        </div>

        {/* AI info text - positioned below the white backdrop with exact right alignment */}
        <div className="w-full max-w-md mt-2 pr-6">
          <div className="text-right">
            <span className="text-xs text-gray-500">
              {aiMode === "time"
                ? `AI thinking time: ${thinkingTime} ${thinkingTime === 1 ? "second" : "seconds"}`
                : simulationCount === 1
                ? "AI yolo mode"
                : `AI simulations: ${simulationCount}`}
            </span>
          </div>
        </div>

        {/* Settings panel - outside the main container for desktop */}
        {showSettings && !isMobile && (
          <div className="absolute top-0 right-0 translate-x-[calc(100%+8px)] w-[220px] space-y-2 hidden md:block">
            <GameSelector
              currentGame={currentGame}
              onGameChange={handleGameChange}
              disabled={false} // Allow game switching even when bot is thinking
            />
            <AISettings
              aiMode={aiMode}
              thinkingTime={thinkingTime}
              simulationCount={simulationCount}
              uctParameter={uctParameter}
              onAiModeChange={setAiMode}
              onThinkingTimeChange={setThinkingTime}
              onSimulationCountChange={setSimulationCount}
              onUctParameterChange={setUctParameter}
              disabled={isBotThinking} // Disable AI settings when bot is thinking
            />
          </div>
        )}

        {/* Mobile settings panel - slides in/out from bottom on small screens */}
        {((showSettings && isMobile) || isSettingsClosing) && (
          <div
            className={`fixed bottom-0 left-0 right-0 bg-white p-4 space-y-2 md:hidden shadow-lg rounded-t-xl
            ${!isSettingsClosing ? "animate-in slide-in-from-bottom duration-200" : "animate-out slide-out-to-bottom duration-200"}`}
          >
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-base font-medium">Settings</h2>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={toggleSettings}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <GameSelector
                currentGame={currentGame}
                onGameChange={handleGameChange}
                disabled={false} // Allow game switching even when bot is thinking
              />
              <AISettings
                aiMode={aiMode}
                thinkingTime={thinkingTime}
                simulationCount={simulationCount}
                uctParameter={uctParameter}
                onAiModeChange={setAiMode}
                onThinkingTimeChange={setThinkingTime}
                onSimulationCountChange={setSimulationCount}
                onUctParameterChange={setUctParameter}
                disabled={isBotThinking} // Disable AI settings when bot is thinking
              />
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
