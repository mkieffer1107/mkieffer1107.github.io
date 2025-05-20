"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"

interface GameSelectorProps {
  currentGame: "tic-tac-toe" | "connect-four" | "othello" | "checkers"
  onGameChange: (game: "tic-tac-toe" | "connect-four" | "othello" | "checkers") => void
  disabled?: boolean // New prop to disable inputs
}

export default function GameSelector({
  currentGame,
  onGameChange,
  disabled = false, // Default to not disabled
}: GameSelectorProps) {
  return (
    <div className={`bg-white p-2 rounded-lg border border-gray-200 shadow-sm ${disabled ? "opacity-70" : ""}`}>
      <h2 className="text-sm font-medium mb-2 text-gray-700">Select Game</h2>
      <RadioGroup
        value={currentGame}
        onValueChange={(value) =>
          !disabled && onGameChange(value as "tic-tac-toe" | "connect-four" | "othello" | "checkers")
        }
        className="space-y-1"
        disabled={disabled}
      >
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${currentGame === "tic-tac-toe" ? "bg-gray-100" : ""} ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <RadioGroupItem value="tic-tac-toe" id="tic-tac-toe" disabled={disabled} />
          <Label htmlFor="tic-tac-toe" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Tic-Tac-Toe
          </Label>
        </div>
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${currentGame === "connect-four" ? "bg-gray-100" : ""} ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <RadioGroupItem value="connect-four" id="connect-four" disabled={disabled} />
          <Label htmlFor="connect-four" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Connect Four
          </Label>
        </div>
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${currentGame === "othello" ? "bg-gray-100" : ""} ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <RadioGroupItem value="othello" id="othello" disabled={disabled} />
          <Label htmlFor="othello" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Othello
          </Label>
        </div>
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${currentGame === "checkers" ? "bg-gray-100" : ""} ${
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          }`}
        >
          <RadioGroupItem value="checkers" id="checkers" disabled={disabled} />
          <Label htmlFor="checkers" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Checkers
          </Label>
        </div>
      </RadioGroup>
    </div>
  )
}
