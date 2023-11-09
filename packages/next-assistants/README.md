# Next-Assistants

Integrate OpenAI assistants into Next.js apps.

## Getting Started

To integrate Next-Assistants into your Next.js application, follow these steps:

### Prerequisites

- Ensure you have Next.js (version 13 or later) set up in your project and are using the app router.
- An OpenAI API key. [Sign up](https://openai.com/) and get your API key from OpenAI.
- openai sdk >= 14.16.2

### Installation

```bash
npm install next-assistants
# or
yarn add next-assistants
# or
pnpm add next-assistants
```


## Server-Side Setup

### Route Handlers

Create a route handler with this file structure: `./app/api/ai/assistants/[assistantId]/[...params]/route.ts`.

```typescript
// ./app/api/ai/assistants/[assistantId]/[...params]/route.ts
import { createAssistantRoutes } from "next-assistants/server";

const handler = createAssistantRoutes({ debug: true });

export async function GET(req, context) {
    return await handler(req, context);
}

export async function POST(req, context) {
    return await handler(req, context);
}
```

## Client-Side Usage

### next-assistants/client

`next-assistants/client`  provides a hook for interacting with AI assistants on the client-side. It handles the creation of threads, sending messages, polling for updates and tracking the status of the assistant.

#### Features

- **Custom React Hook (`useThread`)**: Manage AI conversations with functions for sending messages, creating threads, and tracking status.
- **Real-Time Conversation Handling**: Support for real-time updates and asynchronous operations.
- **Error and Loading State Management**: Built-in handling of loading and error states.


#### Usage Example

Import `useThread` from `next-assistants/client` to manage conversation threads with an assistant.

```jsx
import { useState } from "react";
import { useThread } from "next-assistants/client";

function AssistantComponent() {
    const [prompt, setPrompt] = useState("");
  const { messages, sendMessage, loading } = useThread({
    assistantId: "your-assistant-id",
    threadId: "optional-thread-id",
    functions: {
      generate_image: async ({ image_prompt }) => {
        try {
          const response = await fetch("/api/ai/dalle/generate", {
            method: "POST",
            body: JSON.stringify({
              prompt: image_prompt
            })
          })

          const { data } = await response.json()

          return data?.[0]?.url
        } catch (error) {
          console.log(error)
          throw new Error("could not generate image")
        }
      }
    }
  });

  const handleSubmit = () => {
        sendMessage(prompt);
      setPrompt("");
    };

  return (
        <div>
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />
        <button onClick={handleSubmit} disabled={loading}>Send</button>
        <div>
          {messages.map((msg, index) => (
              <p key={index}>{msg.content}</p>
          ))}
        </div>
      </div>
    );
  }
  ```

---

#### API Reference

### `useThread` Hook

#### Arguments

| Argument   | Type     | Description                              |
|------------|----------|------------------------------------------|
| assistantId | string  | The identifier for the AI assistant.     |
| threadId   | string  | (Optional) Identifier for a specific thread. |
| functions  | object  | (Optional) Custom functions for extended capabilities. |

#### Returns

- **Type**: `Function`
- **Description**: Manages conversation threads with an AI assistant.

  - `createNewThread`: Function to initialize a new conversation thread.
  - `thread`: The current thread object.
  - `messages`: Array of messages in the current thread.
  - `sendMessage`: Function to send a message to the assistant.
  - `startRun`: Function to begin an AI run based on provided input.
  - `error`: Current error state.
  - `loading`: Indicates if the hook is in a loading state.
  - `runStatus`: Status of the current AI run.
  - `initializing`: Indicates if the hook is initializing.


### `createAssistantRoutes`
Creates a handler for routing API requests related to assistants, threads, runs, and file operations.

#### Arguments

| Argument | Type     | Description                                |
|----------|----------|--------------------------------------------|
| `debug`  | `boolean`| Whether to log debug information. Optional. |

#### Returns

- **Type**: `Function`
- **Description**: An async function that handles incoming Next.js App router requests and returns an appropriate response.


---

## License

MIT
