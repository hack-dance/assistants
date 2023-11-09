import { NextResponse } from "next/server"
import OpenAI from "openai"
import { ThreadCreateParams, Threads } from "openai/resources/beta/threads/threads"

export type AssistantFunctions = Record<string, (args) => Promise<string>>

export const openai = new OpenAI()

/**
 * Retrieves the functions available for a specific assistant.
 * @param assistantId - The unique identifier of the assistant.
 * @returns An array of functions available for the assistant.
 */
export async function getAssistantFunctions({ assistantId }: { assistantId: string }) {
  const assistant = await openai.beta.assistants.retrieve(assistantId)
  return assistant.tools
}

/**
 * Retrieves the details of a specific assistant.
 * @param assistantId - The unique identifier of the assistant.
 * @returns The assistant object.
 */
export async function getAssistant({ assistantId }: { assistantId: string }) {
  const assistant = await openai.beta.assistants.retrieve(assistantId)
  return assistant
}

/**
 * Retrieves a specific thread.
 * @param threadId - The unique identifier of the thread.
 * @returns The thread object.
 */
export async function getThread({ threadId }: { threadId: string }) {
  return await openai.beta.threads.retrieve(threadId)
}

/**
 * Handles the creation of a new thread.
 * @param params - The parameters for creating a new thread.
 * @returns The newly created thread object.
 */
export async function handleCreateThread({ params = {} }: { params: ThreadCreateParams }) {
  return await openai.beta.threads.create(params)
}

/**
 * Sends a message to a specific thread.
 * @param threadId - The unique identifier of the thread.
 * @param params - The message content to be sent.
 * @returns The response object from the message creation.
 */
export async function handleSendMessage({
  threadId,
  params
}: {
  threadId: string
  params: { content: string }
}) {
  return await openai.beta.threads.messages.create(threadId, {
    content: params.content,
    role: "user"
  })
}

/**
 * Retrieves all messages from a specific thread.
 * @param threadId - The unique identifier of the thread.
 * @returns An array of message objects from the thread.
 */
export async function handleGetMessages({ threadId }: { threadId: string }) {
  return await openai.beta.threads.messages.list(threadId)
}

/**
 * Starts a run in a specific thread.
 * @param threadId - The unique identifier of the thread.
 * @param assistantId - The unique identifier of the assistant.
 * @param params - The parameters for starting the run.
 * @returns The run object created.
 */
export async function handleStartRun({
  threadId,
  assistantId,
  params
}: {
  threadId: string
  params: Partial<Threads.RunCreateParams>
  assistantId: string
}) {
  return await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    ...params
  })
}

/**
 * Checks the status of a specific run in a thread.
 * @param threadId - The unique identifier of the thread.
 * @param runId - The unique identifier of the run.
 * @returns The run object with its current status.
 */
export async function checkRunStatus({ threadId, runId }: { threadId: string; runId: string }) {
  const run = await openai.beta.threads.runs.retrieve(threadId, runId)

  return run
}

/**
 * Processes tool actions for a specific run in a thread.
 * @param threadId - The unique identifier of the thread.
 * @param runId - The unique identifier of the run.
 * @param params - The results from the tool actions.
 * @returns The status of the submission.
 */
export async function processToolActions({
  threadId,
  runId,
  params
}: {
  assistantId: string
  threadId: string
  runId: string
  params: { results: Record<string, string> }
}) {
  console.log(params)
  await openai.beta.threads.runs.submitToolOutputs(threadId, runId, {
    tool_outputs: Object.entries(params.results).map(([id, response]) => ({
      tool_call_id: id,
      output: response
    }))
  })

  return { status: "submitted" }
}

/**
 * Checks if the assistant has the required functions available.
 * @param assistantId - The unique identifier of the assistant.
 * @param functions - The functions to be checked.
 */
export async function checkAssistantFunctions({
  assistantId,
  functions
}: {
  assistantId: string
  functions: AssistantFunctions
}) {
  try {
    const assistant = await openai.beta.assistants.retrieve(assistantId)

    assistant?.tools.forEach(tool => {
      if (tool.type === "function") {
        const hasFunction = functions?.[tool.function.name]

        if (!hasFunction) {
          throw new Error(
            `The assistant has the Function ${tool.function.name} registered, but no function was provided.`
          )
        }
      }
    })
  } catch (e) {
    console.error(e, "error getting assistant")
    throw e
  }
}

/**
 * Uploads a file to be used by the assistant.
 * @param request - The HTTP request object containing the file.
 * @returns The response object from the file upload.
 */
export async function uploadFile({ request }: { request: Request }) {
  const data = await request.formData()
  const file: File | null = data.get("file") as unknown as File

  const newFile = await openai.files.create({
    file: file,
    purpose: "assistants"
  })

  return newFile
}

/**
 * Retrieves a specific file.
 * @param fileId - The unique identifier of the file.
 * @returns The file object.
 */
export async function getFile({ fileId }: { fileId: string }) {
  const file = await openai.files.retrieve(fileId)

  return file
}

const routeHandlers = {
  assistant: {
    _: { GET: getAssistant },
    functions: { GET: getAssistantFunctions }
  },
  thread: {
    _: { POST: handleCreateThread, GET: getThread },
    messages: { POST: handleSendMessage, GET: handleGetMessages },
    runs: { POST: handleStartRun }
  },
  run: {
    "_": { POST: handleStartRun },
    "status": { GET: checkRunStatus },
    "process-fns": { POST: processToolActions }
  },
  file: {
    _: { POST: uploadFile, GET: getFile }
  }
}

function getRouteHandler(object, action, method) {
  return routeHandlers[object]?.[action]?.[method]
}

/**
 * Creates a handler for routing API requests related to assistants, threads, runs, and file operations.
 * The handler determines the specific action to take based on URL parameters and the HTTP method (GET or POST).
 *
 * @param debug - Whether to log debug information to the console.
 * @returns An async function that handles the incoming request and context, and returns an appropriate response.
 */
export function createAssistantRoutes({ debug = false }: { debug?: boolean } = {}) {
  /**
   * Determines the route object (assistant, thread, run, file) and action based on the provided parameters.
   *
   * @param params The URL parameters extracted from the request.
   * @returns An object containing the route 'object' and 'action' determined from the URL parameters.
   */
  const determineRouteObject = params => {
    let object, action

    if (params[0] === "threads") {
      object = params[2] === "runs" ? "run" : "thread"
      action = params[object === "run" ? 4 : 2] ?? "_"
    } else if (params[0] === "files") {
      object = "file"
      action = params[1] ?? "_"
    } else {
      object = "assistant"
      action = params[0] ?? "_"
    }

    return { object, action }
  }

  /**
   * Extracts arguments needed for the route handler from the request and context parameters.
   *
   * @param req The incoming HTTP request.
   * @param context The context object containing the URL parameters.
   * @param object The route object determined from the URL parameters.
   * @returns An object containing extracted arguments for the route handler.
   */
  const extractArgs = async (req, context, object) => {
    const { params = [], assistantId } = context?.params || {}
    const queryParams = Object.fromEntries(new URL(req.url).searchParams.entries())

    return {
      assistantId: assistantId,
      fileId: object === "file" ? params[1] : undefined,
      threadId: object === "thread" || object === "run" ? params[1] : undefined,
      runId: object === "run" ? params[3] : undefined,
      params: req.method === "POST" ? await req.json() : queryParams,
      request: req
    }
  }

  return async (req, context) => {
    const { params = [] } = context?.params || {}

    const { object, action } = determineRouteObject(params)
    const handler = getRouteHandler(object, action, req.method)

    if (!handler) {
      return NextResponse.json({ error: "Not Found" }, { status: 404 })
    }

    try {
      const args = await extractArgs(req, context, object)
      debug && console.info("Handling assistant request:")
      debug && console.debug({ object, action, method: req.method, params, args })

      const result = await handler(args)
      debug && console.log("Request successful:", { object, action, method: req.method })
      return NextResponse.json(result, { status: 200 })
    } catch (e) {
      debug &&
        console.error("Error handling request:", e.message, { object, action, method: req.method })
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }
}
