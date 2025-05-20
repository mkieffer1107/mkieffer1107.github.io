"use client"

import { useState, useEffect } from "react"

export type GameStatusKey = 
  | "playerTurn"
  | "botTurn"
  | "playerWin"
  | "botWin"
  | "draw"
  | "loading"
  | "error"
  | "aiContinuingJump" // For Checkers AI multi-jump
  | "playerMultiJump"; // For Checkers player multi-jump

interface GameStatusDisplayProps {
  statusKey: GameStatusKey;
  color?: string;
  message?: string; // Optional custom message, primarily for the 'error' statusKey
}

// Updated messages to be simple functions returning strings, or taking specific context if needed.
const messages: Record<GameStatusKey, (props?: { message?: string }) => string> = {
  playerTurn: () => "Your turn 🫵",
  botTurn: () => "🤖 is thinking",
  aiContinuingJump: () => "🤖 is hopping", 
  playerWin: () => "+1 for humanity 🫡",
  botWin: () => "You have been terminated 🦾",
  draw: () => "Live to fight another day 😐",
  loading: () => "Loading Game Engine...",
  error: (props?: { message?: string }) => props?.message || "Error! Please try again. 🧐",
  playerMultiJump: () => "Keep on hopping! 🐸",
};

export default function GameStatusDisplay({
  statusKey,
  color = "#000000",
  message // Destructure message here for the error case
}: GameStatusDisplayProps) {
  const [dots, setDots] = useState("")

  const showEllipsis = statusKey === "botTurn" || statusKey === "aiContinuingJump";

  useEffect(() => {
    let interval: NodeJS.Timeout | undefined = undefined;
    if (showEllipsis) {
      interval = setInterval(() => {
        setDots((prevDots) => {
          if (prevDots === "") return "."
          if (prevDots === ".") return ".."
          if (prevDots === "..") return "..."
          return ""
        })
      }, 400)
    } else {
      setDots(""); // Clear dots if not needed
    }
    return () => clearInterval(interval)
  }, [showEllipsis])

  let messageContent = "Unknown status";
  const messageFn = messages[statusKey];
  if (messageFn) {
    if (statusKey === 'error') {
      messageContent = messageFn({ message });
    } else {
      messageContent = messageFn();
    }
  }
  

  return (
    <span style={{ color }} className="inline-flex items-center whitespace-nowrap">
      {messageContent}
      {showEllipsis && <span className="inline-block min-w-[24px] text-left">{dots}</span>}
    </span>
  )
} 