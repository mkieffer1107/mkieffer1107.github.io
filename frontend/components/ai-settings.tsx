"use client"
import { useState } from "react"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"

interface AISettingsProps {
  aiMode: "time" | "simulations"
  thinkingTime: number
  simulationCount: number
  uctParameter: number
  onAiModeChange: (mode: "time" | "simulations") => void
  onThinkingTimeChange: (time: number) => void
  onSimulationCountChange: (count: number) => void
  onUctParameterChange: (value: number) => void
  disabled?: boolean // New prop to disable inputs
}

export default function AISettings({
  aiMode,
  thinkingTime,
  simulationCount,
  uctParameter,
  onAiModeChange,
  onThinkingTimeChange,
  onSimulationCountChange,
  onUctParameterChange,
  disabled = false, // Default to not disabled
}: AISettingsProps) {
  const [isResetButtonHovered, setIsResetButtonHovered] = useState(false);
  // UCT slider helpers
  const uctMin = 0.1
  const uctMax = 2
  const getUctThumbPosition = () => {
    const percentage = ((uctParameter - uctMin) / (uctMax - uctMin)) * 100
    return `${percentage}%`
  }
  const getUctThumbEmoji = () => {
    const midpoint = (uctMin + uctMax) / 2
    return uctParameter < midpoint ? "💰" : "🗺️"
  }

  // Thinking Time slider helpers
  const thinkingMin = 0.5
  const thinkingMax = 5
  const thinkingMid = (thinkingMin + thinkingMax) / 2
  const getThinkingThumbPosition = () => `${((thinkingTime - thinkingMin) / (thinkingMax - thinkingMin)) * 100}%`
  const getThinkingThumbEmoji = () => (thinkingTime < thinkingMid ? "🐇" : "🐢")

  // Simulation Count slider helpers
  const simMin = 1
  const simMax = 5000
  const simMid = (simMin + simMax) / 2
  const getSimThumbPosition = () => `${((simulationCount - simMin) / (simMax - simMin)) * 100}%`
  const getSimThumbEmoji = () => (simulationCount < simMid ? "⚡" : "🧠")

  return (
    <div className={`bg-white p-2 rounded-lg border border-gray-200 shadow-sm ${disabled ? "opacity-70" : ""}`}>
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-sm font-medium text-gray-700">AI Settings</h2>
        <button
          onClick={() => {
            if (!disabled) {
              onThinkingTimeChange(1.5)
              onSimulationCountChange(1000)
              onUctParameterChange(Math.sqrt(2))
            }
          }}
          onMouseEnter={() => setIsResetButtonHovered(true)}
          onMouseLeave={() => setIsResetButtonHovered(false)}
          className={`icon-button small-icon-button ${disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-gray-200"}`}
          title={disabled ? "Cannot reset while AI is thinking" : "Reset to defaults"}
          disabled={disabled}
        >
          <i className={`fas fa-sync-alt fa-spin ${isResetButtonHovered && !disabled ? "spin-active" : ""}`}></i>
        </button>
      </div>

      <RadioGroup
        value={aiMode}
        onValueChange={(value) => !disabled && onAiModeChange(value as "time" | "simulations")}
        className="space-y-1 mb-2"
        disabled={disabled}
      >
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${
            aiMode === "time" ? "bg-gray-100" : ""
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <RadioGroupItem value="time" id="time-based" disabled={disabled} />
          <Label htmlFor="time-based" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Time-based
          </Label>
        </div>
        <div
          className={`flex items-center space-x-2 p-1 rounded-md ${
            aiMode === "simulations" ? "bg-gray-100" : ""
          } ${disabled ? "cursor-not-allowed" : "cursor-pointer"}`}
        >
          <RadioGroupItem value="simulations" id="simulation-based" disabled={disabled} />
          <Label htmlFor="simulation-based" className={`${disabled ? "cursor-not-allowed" : "cursor-pointer"} text-sm`}>
            Simulation-based
          </Label>
        </div>
      </RadioGroup>

      {aiMode === "time" ? (
        <div className="space-y-2 bg-gray-50 p-2 rounded-md">
          <div className="flex justify-between items-center">
            <Label htmlFor="thinking-time" className="text-xs">
              Thinking Time
            </Label>
            <span className="text-xs font-medium">{thinkingTime} seconds</span>
          </div>

          {/* Custom Thinking Time Slider */}
          <div className="relative mt-4 mb-2">
            <div className="h-2 bg-gray-200 rounded-full">
              <div
                className={`h-2 ${disabled ? "bg-gray-400" : "bg-blue-500"} rounded-full`}
                style={{ width: getThinkingThumbPosition() }}
              />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center ${
                disabled ? "cursor-not-allowed" : "cursor-pointer"
              }`}
              style={{
                left: getThinkingThumbPosition(),
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="text-sm">{getThinkingThumbEmoji()}</span>
            </div>
            <Slider
              id="thinking-time"
              min={thinkingMin}
              max={thinkingMax}
              step={0.1}
              value={[thinkingTime]}
              onValueChange={(value) => !disabled && onThinkingTimeChange(value[0])}
              className={`absolute inset-0 ${disabled ? "opacity-0 cursor-not-allowed" : "opacity-0 cursor-pointer"}`}
              disabled={disabled}
            />
          </div>
        </div>
      ) : (
        <div className="space-y-2 bg-gray-50 p-2 rounded-md">
          <div className="flex justify-between items-center">
            <Label htmlFor="simulation-count" className="text-xs">
              Simulation Count
            </Label>
            <span className="text-xs font-medium">{simulationCount}</span>
          </div>

          {/* Custom Simulation Count Slider */}
          <div className="relative mt-4 mb-2">
            <div className="h-2 bg-gray-200 rounded-full">
              <div
                className={`h-2 ${disabled ? "bg-gray-400" : "bg-blue-500"} rounded-full`}
                style={{ width: getSimThumbPosition() }}
              />
            </div>
            <div
              className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center ${
                disabled ? "cursor-not-allowed" : "cursor-pointer"
              }`}
              style={{
                left: getSimThumbPosition(),
                transform: "translate(-50%, -50%)",
              }}
            >
              <span className="text-sm">{getSimThumbEmoji()}</span>
            </div>
            <Slider
              // min: 1, max: 5000, increments of 1
              // but we want it to look like increments of 10
              // so we round off to the nearest multiple of 10 🤫
              id="simulation-count"
              min={simMin}
              max={simMax}
              step={1}
              value={[simulationCount]}
              onValueChange={(sliderValues) => {
                if (disabled) return;
                const rawValue = sliderValues[0];
                let newSimCount;
                if (rawValue === 1) {
                  newSimCount = 1;
                } else {
                  newSimCount = Math.max(10, Math.round(rawValue / 10) * 10);
                }
                newSimCount = Math.min(simMax, newSimCount);
                onSimulationCountChange(newSimCount);
              }}
              className={`absolute inset-0 ${disabled ? "opacity-0 cursor-not-allowed" : "opacity-0 cursor-pointer"}`}
              disabled={disabled}
            />
          </div>
        </div>
      )}

      {/* UCT Exploration Parameter Slider */}
      <div className="space-y-2 bg-gray-50 p-2 rounded-md mt-2">
        <div className="flex justify-between items-center">
          <Label htmlFor="uct-parameter" className="text-xs">
            Play Style
          </Label>
          <div className="flex items-center space-x-1 text-xs">
            <span className="text-gray-500">Exploit</span>
            <span className="mx-1">—</span>
            <span className="text-gray-500">Explore</span>
          </div>
        </div>
        <div className="relative mt-4 mb-2">
          {/* Custom UCT slider track */}
          <div className="h-2 bg-gray-200 rounded-full">
            <div
              className={`h-2 ${disabled ? "bg-gray-400" : "bg-blue-500"} rounded-full`}
              style={{ width: getUctThumbPosition() }}
            ></div>
          </div>

          {/* Custom UCT thumb with emoji */}
          <div
            className={`absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center ${
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            }`}
            style={{
              left: getUctThumbPosition(),
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="text-sm">{getUctThumbEmoji()}</span>
          </div>

          {/* Hidden actual UCT slider for functionality */}
          <Slider
            id="uct-parameter"
            min={uctMin}
            max={uctMax}
            step={0.05}
            value={[uctParameter]}
            onValueChange={(value) => !disabled && onUctParameterChange(value[0])}
            className={`absolute inset-0 ${disabled ? "opacity-0 cursor-not-allowed" : "opacity-0 cursor-pointer"}`}
            disabled={disabled}
          />
        </div>
      </div>
    </div>
  )
}
