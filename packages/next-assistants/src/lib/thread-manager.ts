import { Assistant } from "openai/resources/beta/assistants/assistants"
import { ThreadCreateParams, Threads } from "openai/resources/beta/threads/threads"

export type AssistantFunctions = Record<string, (args) => Promise<string>>
export type EventCallback = (...data) => void

export type ThreadArgs = {
  assistantId: string
  threadId?: string
  functions?: AssistantFunctions
  onMessagesUpdated?: EventCallback
  onRunStatusChanged?: EventCallback
  onInitialized?: EventCallback
}

/**
 * The `ThreadManager` class is designed to manage and interact with a specific thread and
 * assistant from OpenAI. It includes functionalities to handle messages, file uploads,
 * thread creation, and monitoring the status of runs within a thread.
 *
 * @example
 * const threadManager = new ThreadManager({
 *   assistantId: 'assistant-id',
 *   threadId: 'thread-id',
 *   functions: {
 *     customFunction: async (args) => { ... }
 *   },
 *   onMessagesUpdated: (messages) => { ... },
 *   onRunStatusChanged: (status) => { ... }
 * });
 *
 * @remarks
 * This manager requires an OpenAI assistant ID to operate and can optionally handle
 * custom functions and events for messages and run status updates.
 */
export class ThreadManager {
  public thread: Threads.Thread | null = null
  public messages: Threads.ThreadMessage[] = []
  public assistant: Assistant | null = null

  private pollInterval: number = 2000
  private functions: AssistantFunctions = {}

  private assistantId: string
  private threadId?: string
  private activeRunId?: string

  private initialized: boolean = false

  private onMessagesUpdated: EventCallback
  private onRunStatusChanged: EventCallback
  private onInitialized: EventCallback

  /**
   * Constructs a new instance of ThreadManager.
   * @param {ThreadArgs} param0 - The thread arguments.
   */
  constructor({
    assistantId,
    threadId,
    functions = {},
    onMessagesUpdated,
    onRunStatusChanged,
    onInitialized
  }: ThreadArgs) {
    this.assistantId = assistantId
    this.threadId = threadId

    this.onMessagesUpdated = onMessagesUpdated ?? (() => {})
    this.onRunStatusChanged = onRunStatusChanged ?? (() => {})
    this.onInitialized = onInitialized ?? (() => {})
    this.functions = functions

    this.init()
  }

  private async init() {
    await this.getAssistant()
    await this.checkAssistantFunctions()

    if (this.threadId) {
      await this.getThread()
      await this.getMessages()
      await this.checkForActiveRun()
    }

    this.initialized = true
    this.onInitialized()
  }

  /**
   * Creates a new thread.
   * @param threadArgs - The parameters required to create a new thread.
   * @returns The newly created thread object.
   */
  async createThread({ threadArgs = {} }: { threadArgs: ThreadCreateParams }) {
    try {
      const response = await fetch(`/api/ai/assistants/${this.assistantId}/threads/_`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(threadArgs)
      })

      if (!response.ok) throw new Error("Failed to create thread")
      this.thread = await response.json()
      this.threadId = this.thread?.id

      return this.thread
    } catch (e) {
      console.error("Error creating thread:", e)
      throw e
    }
  }

  /**
   * Retrieves assistant details.
   */
  async getAssistant() {
    const response = await fetch(`/api/ai/assistants/${this.assistantId}/_`)
    if (!response.ok) throw new Error("Failed to retrieve assistant")

    const data = await response.json()

    this.assistant = data

    return data
  }

  async getThread() {
    if (!this.threadId) throw new Error("Thread ID not provided")
    const response = await fetch(
      `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/_`
    )
    if (!response.ok) throw new Error("Failed to retrieve thread")
    const data = await response.json()
    this.thread = data

    return data
  }

  /**
   * Retrieves a specific file by ID.
   * @param fileId - The unique identifier of the file.
   * @returns The file data retrieved.
   */
  async getFile(fileId: string) {
    if (!fileId) throw new Error("File ID not provided")
    const response = await fetch(`/api/ai/assistants/${this.assistantId}/files/${fileId}/_`)
    if (!response.ok) throw new Error("Failed to retrieve file")

    return await response.json()
  }

  /**
   * Uploads a new file.
   * @param file - The file to be uploaded.
   * @returns The response from the file upload.
   */
  async uploadFile(file: File) {
    if (!file) throw new Error("no File provided")

    const data = new FormData()
    data.set("file", file)

    const response = await fetch(`/api/ai/assistants/${this.assistantId}/files/_`, {
      method: "POST",
      body: data
    })

    if (!response.ok) throw new Error("Failed to upload file")

    return await response.json()
  }

  /**
   * Retrieves all messages from the current thread.
   */
  async getMessages() {
    if (!this.threadId) throw new Error("Thread ID not provided")
    const response = await fetch(
      `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/messages`
    )
    if (!response.ok) throw new Error("Failed to retrieve messages")
    const data = await response.json()
    this.messages = data
    this.onMessagesUpdated(data)

    return data
  }

  /**
   * Sends a message to the current thread.
   * @param {string} content - The content of the message.
   * @param {string} [runInstructions] - Optional run instructions.
   * @returns The message object received in response.
   */
  async sendMessage(content: string, runInstructions?: string) {
    if (!this.threadId) throw new Error("Thread ID not provided")
    const response = await fetch(
      `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, runInstructions })
      }
    )
    if (!response.ok) throw new Error("Failed to send message")
    const message = await response.json()

    await this.getMessages()
    await this.startRun({})

    return message
  }

  async checkForActiveRun() {
    if (!this.threadId) throw new Error("Thread ID not provided")
    const response = await fetch(
      `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/runs/latest`
    )

    if (!response.ok) throw new Error("Failed to retrieve run")
    const runs = await response.json()
    const run = runs?.data?.[0] ?? null

    if (
      run &&
      !["completed", "failed", "cancelled", "expired", "cancelling"].includes(run?.status)
    ) {
      this.activeRunId = run?.id
      this.onRunStatusChanged(run?.status)
      this.pollRunStatus()
    }

    return run
  }

  /**
   * Starts a run in the current thread.
   * @param runArgs - The arguments for starting the run.
   * @returns The run object created.
   */
  async startRun(runArgs: Partial<Threads.RunCreateParams>) {
    if (!this.threadId) throw new Error("Thread ID not provided")
    const response = await fetch(
      `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/runs/_`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistant_id: this.assistantId, ...runArgs })
      }
    )

    if (!response.ok) throw new Error("Failed to start run")

    const run = await response.json()

    this.onRunStatusChanged(run.status)

    this.activeRunId = run.id
    this.pollRunStatus()

    return run
  }

  async pollRunStatus() {
    if (!this.threadId || !this.activeRunId) throw new Error("Thread ID or Run ID not provided")

    const poll = async () => {
      const response = await fetch(
        `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/runs/${this.activeRunId}/status`
      )

      if (!response.ok) throw new Error("Failed to check run status")
      const run = await response.json()

      this.onRunStatusChanged(run.status)

      if (run.status === "completed" || run.status.match(/failed|cancelled|expired/)) {
        this.getMessages()

        return
      }

      if (run.status === "requires_action") {
        await this.processToolActions(run)
      }

      setTimeout(poll, this.pollInterval)
    }

    poll()
  }

  private async processToolActions(run) {
    try {
      const actions = run.required_action.submit_tool_outputs.tool_calls
      const results: Record<string, string | null> = {}

      for await (const action of actions) {
        if (action.type === "function") {
          try {
            const fnResponse = await this.functions[action.function.name](
              JSON.parse(action.function.arguments)
            )

            results[action.id] = fnResponse
          } catch (e) {
            results[action.id] = null
            console.error(e, "local function invocation error", action.function.name)
          }
        }
      }

      const response = await fetch(
        `/api/ai/assistants/${this.assistantId}/threads/${this.threadId}/runs/${run.id}/process-fns`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ results })
        }
      )

      if (!response.ok) throw new Error("Failed to start run")

      return await response.json()
    } catch (e) {
      console.error(e, "error processing thread actions")
    }
  }

  async checkAssistantFunctions() {
    try {
      this.assistant?.tools?.forEach(tool => {
        if (tool.type === "function") {
          const hasFunction = this.functions?.[tool.function.name]

          if (!hasFunction) {
            throw new Error(
              `The assistant ${this.assistant?.name} has the Function ${tool.function.name} registered, but no handler was provided.`
            )
          }
        }
      })
    } catch (e) {
      console.error(e, "error getting assistant")
      throw e
    }
  }
}
