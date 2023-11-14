import { useCallback, useEffect, useRef, useState } from "react"
import { Messages, ThreadMessage } from "openai/resources/beta/threads/messages/messages"
import { Run } from "openai/resources/beta/threads/runs/runs"
import { Thread } from "openai/resources/beta/threads/threads"
import { equals } from "ramda"

import { AssistantFunctions, ThreadManager } from "@/lib/thread-manager"

/**
 * Defines the structure of the object returned by the useThread hook.
 */
export interface UseThreadResult {
  /**
   * Creates a new thread. Optionally accepts thread arguments.
   * @param threadArgs - Optional arguments for thread creation.
   * @returns A promise that resolves to the newly created thread object.
   */
  createNewThread: (threadArgs?: object) => Promise<Thread>

  /**
   * Current state of the thread.
   */
  thread: object | null

  /**
   * Array of messages in the current thread.
   */
  messages: Messages.ThreadMessage[]

  /**
   * Sends a message to the current thread.
   * @param content - The message content to be sent.
   * @returns A promise that resolves when the message is sent.
   */
  sendMessage: (content: string) => Promise<ThreadMessage>

  /**
   * Starts a new run (conversation turn) with the AI assistant.
   * @param runArgs - Optional arguments for starting a new run.
   * @returns A promise that resolves when the run is started.
   */
  startRun: (runArgs?: object) => Promise<Run>

  /**
   * Current error state, if any.
   */
  error: Error | null

  /**
   * Boolean indicating whether the hook is currently loading data.
   */
  loading: boolean

  /**
   * Current status of the run, if any.
   */
  runStatus: string | null

  /**
   * Boolean indicating whether the thread is currently initializing.
   */
  initializing: boolean
  /**
   * The thread manager instance.
   *
   * @remarks
   * This is exposed for advanced use cases. You should not need to use this directly.
   */
  threadManager: ThreadManager | null
}

/**
 * Custom React hook to manage conversation threads with an OpenAI assistant.
 *
 * @param {string} params.assistantId - The ID of the AI assistant.
 * @param {string} [params.threadId] - Optional ID of an existing thread.
 * @param {AssistantFunctions} [params.functions] - Optional custom functions for processing assistant responses.
 * @returns {UseThreadResult} An object containing thread management functions and state variables.
 */
export function useThread({
  assistantId,
  threadId,
  functions,
  pollInterval
}: {
  assistantId: string
  threadId?: string
  functions?: AssistantFunctions
  pollInterval?: number
}): UseThreadResult {
  const [messages, setMessages] = useState([])
  const [runStatus, setRunStatus] = useState(null)
  const [thread, setThread] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)

  const threadManagerRef = useRef<ThreadManager | null>(null)
  const threadManager = threadManagerRef?.current

  if (!threadManager) {
    threadManagerRef.current = new ThreadManager({
      assistantId,
      pollInterval,
      threadId,
      functions,
      onInitialized: () => {
        setInitializing(false)
      },
      onMessagesUpdated: ({ data }) => {
        if (!equals(messages, data)) {
          setMessages(data.reverse())
        }
      },
      onRunStatusChanged: status => {
        if (["completed", "failed", "cancelled", "expired"].includes(status)) {
          setLoading(false)
        }

        if (["in_progress", "queued", "requires_action"].includes(status)) {
          setLoading(true)
        }

        if (!equals(runStatus, status)) {
          setRunStatus(status)
        }
      }
    })
  }

  const handleOperation = async (operation, successCallback?: (result) => void) => {
    try {
      const result = await operation()

      if (successCallback) {
        successCallback(result)
      }

      return result
    } catch (e) {
      console.error("Operation error:", e)
      setLoading(false)
      setError(e)
    }
  }

  const sendMessage = useCallback(
    content => {
      return handleOperation(() => {
        if (!threadManager) {
          throw new Error("Thread manager not initialized")
        }
        setLoading(true)

        return threadManager.sendMessage(content, "The user is a 4 year old girl named Sophia...")
      })
    },
    [threadManager]
  )

  const startRun = useCallback(
    (runArgs = {}) => {
      return handleOperation(() => {
        if (!threadManager) {
          throw new Error("Thread manager not initialized")
        }

        setLoading(true)
        return threadManager.startRun(runArgs)
      })
    },
    [threadManager]
  )

  const createNewThread = useCallback(
    (threadArgs = {}) => {
      return handleOperation(() => {
        if (!threadManager) {
          throw new Error("Thread manager not initialized")
        }

        return threadManager.createThread({ threadArgs })
      }, setThread)
    },
    [threadManager]
  )

  useEffect(() => {
    if (!threadId || thread) {
      return
    }

    handleOperation(() => {
      if (!threadManager) {
        throw new Error("Thread manager not initialized")
      }

      return threadManager.getThread()
    }, setThread)
  }, [threadId, threadManager, thread])

  return {
    createNewThread,
    thread,
    messages,
    sendMessage,
    startRun,
    error,
    loading,
    runStatus,
    initializing,
    threadManager
  }
}
