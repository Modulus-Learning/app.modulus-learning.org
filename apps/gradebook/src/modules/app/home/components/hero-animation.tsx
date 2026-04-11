'use client'

import { useEffect, useState } from 'react'

import { Check } from 'lucide-react'

export function HeroAnimation() {
  const [step, setStep] = useState(0)
  const [inputValue, setInputValue] = useState('')
  const [showCheckmark, setShowCheckmark] = useState(false)
  const [isTyping, setIsTyping] = useState(false)

  const correctAnswer = '42'
  const question = 'What is the value of x when 2x + 14 = 98?'

  useEffect(() => {
    const sequence = async () => {
      // Reset
      setStep(0)
      setInputValue('')
      setShowCheckmark(false)
      setIsTyping(false)

      // Wait then show question
      await delay(500)
      setStep(1)

      // Wait then start typing
      await delay(1500)
      setIsTyping(true)

      // Type the answer character by character
      for (let i = 0; i <= correctAnswer.length; i++) {
        await delay(300)
        setInputValue(correctAnswer.slice(0, i))
      }

      setIsTyping(false)

      // Wait then show submit
      await delay(500)
      setStep(2)

      // Wait then show checkmark
      await delay(800)
      setShowCheckmark(true)

      // Wait then restart
      await delay(3000)
      sequence()
    }

    sequence()
  }, [])

  return (
    <div className="relative w-full max-w-md mx-auto">
      {/* Glow effect behind card */}
      <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-accent/20 to-primary/20 blur-3xl -z-10 scale-150" />

      {/* Activity Card */}
      <div className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <div className="h-3 w-3 rounded-full bg-red-500/80" />
          <div className="h-3 w-3 rounded-full bg-yellow-500/80" />
          <div className="h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-2 text-xs text-muted-foreground font-mono">ximera-activity.tex</span>
        </div>

        {/* Question */}
        <div
          className={`transition-all duration-500 ${step >= 1 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}
        >
          <p className="text-muted-foreground text-sm mb-2">Problem 3.2</p>
          <p className="text-foreground text-lg font-medium mb-6">{question}</p>

          {/* Math visualization */}
          <div className="bg-secondary/50 rounded-lg p-4 mb-6 font-mono text-sm">
            <div className="text-muted-foreground">
              <span className="text-primary">2x</span> + 14 = 98
            </div>
            <div className="text-muted-foreground mt-1">
              <span className="text-primary">2x</span> = 84
            </div>
            <div className="text-muted-foreground mt-1">
              <span className="text-primary">x</span> = <span className="text-accent">?</span>
            </div>
          </div>

          {/* Input field */}
          <div className="relative">
            <span className="text-sm text-muted-foreground mb-2 block">Your answer:</span>
            <div
              className={`flex items-center gap-3 bg-input border rounded-lg px-4 py-3 transition-all duration-300 ${
                showCheckmark ? 'border-green-500' : 'border-border'
              }`}
            >
              <span className="text-muted-foreground font-mono">x =</span>
              <span
                className={`font-mono text-lg min-w-[2rem] ${showCheckmark ? 'text-green-500' : 'text-foreground'}`}
              >
                {inputValue}
                {isTyping && <span className="animate-pulse">|</span>}
              </span>

              {/* Checkmark */}
              <div
                className={`ml-auto transition-all duration-500 ${
                  showCheckmark ? 'opacity-100 scale-100' : 'opacity-0 scale-0'
                }`}
              >
                <div className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center">
                  <Check className="h-5 w-5 text-background" strokeWidth={3} />
                </div>
              </div>
            </div>
          </div>

          {/* Success message */}
          <div
            className={`mt-4 text-green-500 text-sm font-medium transition-all duration-500 ${
              showCheckmark ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
            }`}
          >
            Correct! Great work solving for x.
          </div>
        </div>
      </div>
    </div>
  )
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
