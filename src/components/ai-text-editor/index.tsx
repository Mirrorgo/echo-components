import { callAI } from "@/utils/aiService";
import { useState, useRef, useEffect, ChangeEvent, KeyboardEvent } from "react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Loader2, Play } from "lucide-react";
import { Textarea } from "../ui/textarea";

// System prompt for the AI command interpreter
const SystemPrompt = `
You are a text editor command interpreter for a multilingual text editor.
Convert user's natural language requests into simplified sequential commands.

IMPORTANT: Analyze the current text content carefully before generating commands.
You must reference the actual text content in the editor when relevant.

Available commands (simplified):
MOVE [position] - Move cursor to absolute position
SELECT [start] [end] - Select text range by absolute positions
INSERT [text] - Insert text at current cursor position
DELETE - Delete selection if there is one, or delete character before cursor if no selection

Rules:
1. Commands should be executed sequentially, with cursor movements between operations
2. Break down complex operations into simple sequences of MOVE, SELECT, DELETE, and INSERT
3. When handling operations on specific sections of text, first use MOVE or SELECT to position the cursor
4. When references to text content are made (like "delete this paragraph"), find the actual text in the editor
5. Use precise character positions based on the current cursor position
6. Output only the necessary command(s), one per line, no explanations

Examples:
- If user says "delete the first word and insert hello", output:
  SELECT 0 5
  DELETE
  INSERT hello
  
- If user says "add a period at the end of line 3", output:
  MOVE 157
  INSERT .

- If user says "replace word 'test' with 'example'", output:
  MOVE 25
  SELECT 25 29
  DELETE
  INSERT example
`;

// Default text for the editor
const defaultText = `This is a sample text.
You can edit it using natural language commands.
Try commands like "delete line 2" or "insert Hello at the beginning".
The AI will convert your instructions into editor commands.`;

// Command execution result interface
export interface CommandExecutionResult {
  success: boolean;
  message: string;
  newText?: string;
  newCursorPosition?: number;
  selectionStart?: number; // Added for selection tracking
  selectionEnd?: number; // Added for selection tracking
}

// Options for command execution
export interface CommandExecutorOptions {
  text: string;
  cursorPosition: number;
  textAreaRef?: React.RefObject<HTMLTextAreaElement>;
  selection?: { start: number; end: number }; // Added for selection tracking
}

export type CommandType = "MOVE" | "SELECT" | "INSERT" | "DELETE";

// Main command executor function
export const executeCommand = (
  cmdString: string,
  options: CommandExecutorOptions
): CommandExecutionResult => {
  const { text, cursorPosition, textAreaRef, selection } = options;
  const cmdPattern = /^(\w+)(?:\s+(.*))?$/i;
  const match = cmdString.trim().match(cmdPattern);

  if (!match) {
    return {
      success: false,
      message: "Invalid command format",
    };
  }

  const command = match[1].toUpperCase() as CommandType;
  const args = match[2] || "";

  // If there's a selection active, make sure the textAreaRef has it set
  if (selection && textAreaRef?.current) {
    textAreaRef.current.setSelectionRange(selection.start, selection.end);
  }

  switch (command) {
    case "MOVE":
      return executeMoveCommand(args, text, cursorPosition);

    case "SELECT":
      return executeSelectCommand(args, text, cursorPosition, textAreaRef);

    case "INSERT":
      return executeInsertCommand(args, text, cursorPosition, textAreaRef);

    case "DELETE":
      return executeDeleteCommand(text, cursorPosition, textAreaRef);

    default:
      return {
        success: false,
        message: `Unknown command: ${command}`,
      };
  }
};

// Execute MOVE command - updated to reset selection
const executeMoveCommand = (
  args: string,
  text: string,
  cursorPosition: number
): CommandExecutionResult => {
  const posMatch = args.match(/^(\d+)$/);
  if (!posMatch) {
    return {
      success: false,
      message: "Error: MOVE requires a position number",
    };
  }

  const newPos = parseInt(posMatch[1], 10);
  if (newPos >= 0 && newPos <= text.length) {
    return {
      success: true,
      message: `Cursor moved to position ${newPos}`,
      newCursorPosition: newPos,
      // Reset selection to just the cursor position
      selectionStart: newPos,
      selectionEnd: newPos,
    };
  } else {
    return {
      success: false,
      message: `Error: Position ${newPos} out of range`,
    };
  }
};

// Execute SELECT command - updated to return selection info
const executeSelectCommand = (
  args: string,
  text: string,
  cursorPosition: number,
  textAreaRef?: React.RefObject<HTMLTextAreaElement>
): CommandExecutionResult => {
  const selectMatch = args.match(/^(\d+)\s+(\d+)$/);
  if (!selectMatch) {
    return {
      success: false,
      message: "Error: SELECT requires start and end positions",
    };
  }

  const start = parseInt(selectMatch[1], 10);
  const end = parseInt(selectMatch[2], 10);

  if (start >= 0 && end <= text.length && start <= end) {
    if (textAreaRef?.current) {
      textAreaRef.current.setSelectionRange(start, end);
    }

    return {
      success: true,
      message: `Selected text from position ${start} to ${end}`,
      // Don't update cursorPosition to end, as this would cause useEffect to reset selection
      // newCursorPosition: end,
      // Add selection information to the result
      selectionStart: start,
      selectionEnd: end,
    };
  } else {
    return {
      success: false,
      message: "Error: Invalid selection range",
    };
  }
};

// Execute INSERT command - updated to handle selection replacement
const executeInsertCommand = (
  args: string,
  text: string,
  cursorPosition: number,
  textAreaRef?: React.RefObject<HTMLTextAreaElement>
): CommandExecutionResult => {
  if (!args) {
    return {
      success: false,
      message: "Error: INSERT requires text to insert",
    };
  }

  // Handle quoted text
  let insertText: string;
  const quotedMatch = args.match(/^"([^"]*)"$/);
  if (quotedMatch) {
    insertText = quotedMatch[1];
  } else {
    insertText = args;
  }

  // Check if there's a selection
  let selectionStart = cursorPosition;
  let selectionEnd = cursorPosition;

  if (textAreaRef?.current) {
    selectionStart = textAreaRef.current.selectionStart;
    selectionEnd = textAreaRef.current.selectionEnd;
  }

  // If there's a selection, replace it with the inserted text
  let newText;
  let newPosition;

  if (selectionStart !== selectionEnd) {
    newText =
      text.substring(0, selectionStart) +
      insertText +
      text.substring(selectionEnd);
    newPosition = selectionStart + insertText.length;
  } else {
    // No selection, just insert at cursor position
    newText =
      text.substring(0, cursorPosition) +
      insertText +
      text.substring(cursorPosition);
    newPosition = cursorPosition + insertText.length;
  }

  return {
    success: true,
    message: `Inserted text${
      selectionStart !== selectionEnd ? " (replacing selection)" : ""
    }`,
    newText,
    newCursorPosition: newPosition,
    selectionStart: newPosition,
    selectionEnd: newPosition,
  };
};

// Execute DELETE command - updated to handle selection and update selection state
const executeDeleteCommand = (
  text: string,
  cursorPosition: number,
  textAreaRef?: React.RefObject<HTMLTextAreaElement>
): CommandExecutionResult => {
  // Check if there's a selection
  let selectionStart = cursorPosition;
  let selectionEnd = cursorPosition;

  if (textAreaRef?.current) {
    selectionStart = textAreaRef.current.selectionStart;
    selectionEnd = textAreaRef.current.selectionEnd;
  }

  // If there's a selection, delete it
  if (selectionStart !== selectionEnd) {
    const newText =
      text.substring(0, selectionStart) + text.substring(selectionEnd);

    return {
      success: true,
      message: "Deleted selected text",
      newText,
      newCursorPosition: selectionStart,
      // Reset selection after deletion
      selectionStart: selectionStart,
      selectionEnd: selectionStart,
    };
  }
  // If there's no selection, delete the character before cursor
  else if (cursorPosition > 0) {
    const newText =
      text.substring(0, cursorPosition - 1) + text.substring(cursorPosition);

    return {
      success: true,
      message: "Deleted character before cursor",
      newText,
      newCursorPosition: cursorPosition - 1,
      // Update selection to match cursor
      selectionStart: cursorPosition - 1,
      selectionEnd: cursorPosition - 1,
    };
  } else {
    return {
      success: false,
      message: "Error: No selection and cursor at beginning of text",
    };
  }
};

// Get line info for display
export const getLineInfo = (text: string, cursorPosition: number): string => {
  const lines: string[] = text.split("\n");
  let lineIndex: number = 1;
  let charCount: number = 0;

  for (let i = 0; i < lines.length; i++) {
    if (
      cursorPosition > charCount &&
      cursorPosition <= charCount + lines[i].length + 1
    ) {
      lineIndex = i + 1;
      break;
    }
    charCount += lines[i].length + 1;
  }

  return `Line ${lineIndex}/${lines.length}`;
};

// Enhanced editor state function that provides more context information
export const getEnhancedEditorState = (
  text: string,
  cursorPosition: number
): string => {
  const lines: string[] = text.split("\n");
  let currentLineIndex: number = 0;
  let charCount: number = 0;
  let positionInLine: number = 0;

  // Determine current line
  for (let i = 0; i < lines.length; i++) {
    if (
      cursorPosition >= charCount &&
      cursorPosition <= charCount + lines[i].length
    ) {
      currentLineIndex = i;
      positionInLine = cursorPosition - charCount;
      break;
    }
    charCount += lines[i].length + 1; // +1 for the newline
  }

  // Current line content (with cursor indicator)
  const currentLine = lines[currentLineIndex] || "";
  const currentLineWithCursor =
    currentLine.substring(0, positionInLine) +
    "█" + // Clear cursor marker
    currentLine.substring(positionInLine);

  // Add line numbers to text lines
  const numberedLines = lines
    .map((line, idx) => `${(idx + 1).toString().padStart(3, " ")}: ${line}`)
    .join("\n");

  // Enhanced editor state
  return `Current editor state:
- Total lines: ${lines.length}
- Cursor position: line ${
    currentLineIndex + 1
  }, character ${positionInLine}, absolute position ${cursorPosition}
- Current line (with cursor █): "${currentLineWithCursor}"

Numbered text content:
${numberedLines}

User is referring to this text content in their command.`;
};

// Chat message interface
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// AI response interface
interface AIResponse {
  success: boolean;
  content: string;
  error?: string;
}

// History entry interface
interface HistoryEntry {
  type: "user" | "ai" | "system";
  text: string;
}

// Command line interface
interface CommandLine {
  id: string;
  text: string;
  executed: boolean;
}

// Main AITextEditor component
const AITextEditor: React.FC = () => {
  const [text, setText] = useState<string>(defaultText);
  const [userCommand, setUserCommand] = useState<string>("");
  const [commandLines, setCommandLines] = useState<CommandLine[]>([]);
  const [cursorPosition, setCursorPosition] = useState<number>(0);
  const [selection, setSelection] = useState<{ start: number; end: number }>({
    start: 0,
    end: 0,
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const apiKey: string = import.meta.env.VITE_AI_API_KEY || "your_api_key_here";

  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  // Focus management and cursor/selection position update
  useEffect(() => {
    if (textAreaRef.current) {
      textAreaRef.current.focus();
      // Use selection state instead of just cursorPosition
      textAreaRef.current.setSelectionRange(selection.start, selection.end);
    }
  }, [selection, cursorPosition]); // Add selection as dependency

  // Add entry to history
  const addToHistory = (
    message: string,
    type: HistoryEntry["type"] = "system"
  ): void => {
    setHistory((prev) => [...prev, { type, text: message }]);
  };

  // Generate a unique ID for each command line
  const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  };

  // Improved parse user command function with enhanced editor state
  const parseUserCommand = async (): Promise<void> => {
    if (!userCommand.trim()) return;

    // Add user command to history
    addToHistory(`User: ${userCommand}`, "user");
    setIsProcessing(true);

    try {
      // Use enhanced editor state to provide more context
      const enhancedEditorState = getEnhancedEditorState(text, cursorPosition);

      // Prepare messages for AI
      const messages: ChatMessage[] = [
        {
          role: "system",
          content: SystemPrompt,
        },
        {
          role: "user",
          content: `${enhancedEditorState}\n\nUser command: ${userCommand}`,
        },
      ];

      // Call AI service
      const response: AIResponse = await callAI(messages, "qwen", {
        apiKey: apiKey,
        modelName: "claude-3-5-haiku-latest",
      });

      if (response.success) {
        // Process the AI response into command lines
        const commands = response.content
          .split("\n")
          .filter((cmd) => cmd.trim())
          .map((cmd) => ({
            id: generateId(),
            text: cmd,
            executed: false,
          }));

        setCommandLines(commands);
        addToHistory(`AI parsed into ${commands.length} commands`, "ai");
      } else {
        addToHistory(
          `AI error: ${response.error || "Unknown error"}`,
          "system"
        );
      }
    } catch (error) {
      addToHistory(
        `Error: ${
          error instanceof Error
            ? error.message
            : "Failed to communicate with AI service"
        }`,
        "system"
      );
    } finally {
      setIsProcessing(false);
      setUserCommand(""); // Clear user command input
    }
  };

  // Execute a single command line - updated to handle selection
  const executeCommandLine = (commandLine: CommandLine): void => {
    if (!commandLine.text.trim()) {
      addToHistory("System: Empty command, nothing to execute", "system");
      return;
    }

    if (!textAreaRef.current) {
      addToHistory("System: Text editor reference not available", "system");
      return;
    }

    addToHistory(`Executing: ${commandLine.text}`, "ai");

    // Make sure the textarea has the current selection state
    textAreaRef.current.setSelectionRange(selection.start, selection.end);

    // Use current text, cursor position and selection for the command
    const options: CommandExecutorOptions = {
      text,
      cursorPosition,
      textAreaRef,
      selection: {
        start: selection.start,
        end: selection.end,
      },
    };

    const result = executeCommand(commandLine.text, options);

    // Add result to history
    const statusEmoji = result.success ? "✅" : "❌";
    addToHistory(`${statusEmoji} ${result.message}`, "system");

    if (result.success) {
      // Update state with new values
      if (result.newText !== undefined) {
        setText(result.newText);
      }

      // For SELECT commands, don't update cursorPosition if we have selection info
      const isSelectCommand = commandLine.text.trim().startsWith("SELECT");

      if (
        result.newCursorPosition !== undefined &&
        !(isSelectCommand && result.selectionStart !== undefined)
      ) {
        setCursorPosition(result.newCursorPosition);
      }

      // Update selection state if provided in the result
      if (
        result.selectionStart !== undefined &&
        result.selectionEnd !== undefined
      ) {
        setSelection({
          start: result.selectionStart,
          end: result.selectionEnd,
        });
      }

      // Mark the command as executed
      setCommandLines((prevLines) =>
        prevLines.map((line) =>
          line.id === commandLine.id ? { ...line, executed: true } : line
        )
      );
    }
  };

  // Execute all commands in sequence - updated to properly handle selection
  const executeAllCommands = (): void => {
    // Filter out already executed commands
    const pendingCommands = commandLines.filter((cmd) => !cmd.executed);

    if (pendingCommands.length === 0) {
      addToHistory("System: No commands to execute", "system");
      return;
    }

    addToHistory(
      `System: Executing ${pendingCommands.length} commands in sequence`,
      "system"
    );

    // Use temporary variables to store current state
    let currentText = text;
    let currentCursorPosition = cursorPosition;
    let currentSelectionStart = selection.start;
    let currentSelectionEnd = selection.end;

    // Execute each command sequentially
    for (const cmd of pendingCommands) {
      addToHistory(`Executing: ${cmd.text}`, "ai");

      // Prepare the textarea ref for this execution
      if (textAreaRef.current) {
        // Ensure the DOM selection matches our tracking variables
        textAreaRef.current.focus();
        textAreaRef.current.setSelectionRange(
          currentSelectionStart,
          currentSelectionEnd
        );
      }

      // Use current text, cursor position and selection for each command
      const options: CommandExecutorOptions = {
        text: currentText,
        cursorPosition: currentCursorPosition,
        textAreaRef,
        // Add selection information to options
        selection: {
          start: currentSelectionStart,
          end: currentSelectionEnd,
        },
      };

      const result = executeCommand(cmd.text, options);

      // Add result to history
      const statusEmoji = result.success ? "✅" : "❌";
      addToHistory(`${statusEmoji} ${result.message}`, "system");

      if (result.success) {
        // Update temporary variables
        if (result.newText !== undefined) {
          currentText = result.newText;
        }

        // For SELECT commands, don't update cursorPosition if we have selection info
        const isSelectCommand = cmd.text.trim().startsWith("SELECT");

        if (
          result.newCursorPosition !== undefined &&
          !(isSelectCommand && result.selectionStart !== undefined)
        ) {
          currentCursorPosition = result.newCursorPosition;
        }

        // Update selection state if provided
        if (
          result.selectionStart !== undefined &&
          result.selectionEnd !== undefined
        ) {
          currentSelectionStart = result.selectionStart;
          currentSelectionEnd = result.selectionEnd;
        }
      }
    }

    // Update state once after all commands are executed
    setText(currentText);
    setCursorPosition(currentCursorPosition);
    setSelection({
      start: currentSelectionStart,
      end: currentSelectionEnd,
    });

    // Mark all commands as executed
    setCommandLines((prevLines) =>
      prevLines.map((line) => ({ ...line, executed: true }))
    );
  };

  // Event handlers
  const handleUserCommandChange = (e: ChangeEvent<HTMLInputElement>): void => {
    setUserCommand(e.target.value);
  };

  const handleCommandLineChange = (id: string, newText: string): void => {
    setCommandLines((prevLines) =>
      prevLines.map((line) =>
        line.id === id ? { ...line, text: newText, executed: false } : line
      )
    );
  };

  const handleUserKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      parseUserCommand();
    }
  };

  const handleTextChange = (e: ChangeEvent<HTMLTextAreaElement>): void => {
    setText(e.target.value);
  };

  const handleCursorChange = (
    e: React.SyntheticEvent<HTMLTextAreaElement>
  ): void => {
    const target = e.target as HTMLTextAreaElement;
    setCursorPosition(target.selectionStart);
    setSelection({
      start: target.selectionStart,
      end: target.selectionEnd,
    });
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-100 p-4">
      <h1 className="text-2xl font-bold mb-4 text-gray-800">AI Text Editor</h1>

      {/* Main content area */}
      <div className="flex flex-col md:flex-row gap-4 flex-grow">
        {/* Left side: Text editor */}
        <div className="w-full md:w-1/2 flex flex-col">
          <div className="bg-white rounded-lg shadow p-4 mb-2">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Text Content</h2>
              <div className="text-sm text-gray-500">
                {getLineInfo(text, cursorPosition)} | Cursor: {cursorPosition} |
                {selection.start !== selection.end &&
                  ` Selection: ${selection.start}-${selection.end} |`}
                Chars: {text.length}
              </div>
            </div>
            <Textarea
              ref={textAreaRef}
              value={text}
              onChange={handleTextChange}
              onClick={handleCursorChange}
              onKeyUp={handleCursorChange}
              onMouseUp={handleCursorChange}
              className="min-h-[200px]"
            />
          </div>
        </div>

        {/* Right side: Commands and history */}
        <div className="w-full md:w-1/2 flex flex-col">
          {/* User command input area */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <h2 className="text-lg font-semibold mb-2">User Command</h2>
            <div className="flex gap-1">
              <Input
                type="text"
                placeholder="Type natural language command (e.g., 'delete line 2')"
                value={userCommand}
                onChange={handleUserCommandChange}
                onKeyDown={handleUserKeyDown}
                disabled={isProcessing}
              />
              <Button onClick={parseUserCommand} disabled={isProcessing}>
                {isProcessing && <Loader2 className="animate-spin" />}
                {isProcessing ? "Processing..." : "Send"}
              </Button>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Try: "delete line 2", "insert text at beginning", "translate line
              2 to Chinese" or "replace line 3 with new content"
            </div>
          </div>

          {/* AI commands input area */}
          <div className="bg-white rounded-lg shadow p-4 mb-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-lg font-semibold">Commands</h2>
              {commandLines.length > 0 && (
                <Button
                  size="sm"
                  onClick={executeAllCommands}
                  variant="outline"
                >
                  Run All
                </Button>
              )}
            </div>
            <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
              {commandLines.length === 0 ? (
                <div className="text-sm text-gray-500 italic">
                  AI parsed commands will appear here
                </div>
              ) : (
                commandLines.map((cmd) => (
                  <div
                    key={cmd.id}
                    className={`flex items-center gap-2 p-2 rounded border ${
                      cmd.executed
                        ? "bg-gray-50 border-gray-200"
                        : "bg-white border-gray-300"
                    }`}
                  >
                    <Input
                      value={cmd.text}
                      onChange={(e) =>
                        handleCommandLineChange(cmd.id, e.target.value)
                      }
                      className={cmd.executed ? "text-gray-500" : ""}
                    />
                    <Button
                      size="sm"
                      onClick={() => executeCommandLine(cmd)}
                      disabled={cmd.executed}
                      variant={cmd.executed ? "outline" : "default"}
                    >
                      <Play className="h-4 w-4 mr-1" />
                      Run
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
          <HistoryList history={history} />
        </div>
      </div>
    </div>
  );
};

// Enhanced HistoryList component
const HistoryList = ({ history }: { history: HistoryEntry[] }) => {
  return (
    <div className="bg-white rounded-lg shadow p-4 flex-grow">
      <h2 className="text-lg font-semibold mb-2">History</h2>
      <div className="bg-gray-50 p-2 rounded border border-gray-200 h-52 overflow-y-auto text-sm">
        {history.length === 0 ? (
          <div className="text-gray-500 italic">
            Command history will appear here
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {history.map((entry, index) => {
              // Determine styling based on entry type
              let textClass = "";
              let bgClass = "";

              switch (entry.type) {
                case "user":
                  textClass = "text-gray-800";
                  bgClass = "bg-blue-50 border-l-2 border-blue-400";
                  break;
                case "ai":
                  textClass = "text-green-700";
                  bgClass = entry.text.startsWith("Executing")
                    ? "bg-green-50 border-l-2 border-green-500"
                    : "";
                  break;
                case "system":
                  textClass = entry.text.includes("✅")
                    ? "text-green-600"
                    : entry.text.includes("❌")
                    ? "text-red-600"
                    : "text-blue-600";
                  bgClass = "";
                  break;
              }

              return (
                <div
                  key={index}
                  className={`p-1 rounded ${bgClass} ${textClass}`}
                >
                  {entry.text}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AITextEditor;
