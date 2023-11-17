import * as vscode from "vscode";
import axios from "axios";

// Define a type for response history entries
interface ResponseHistoryEntry {
  timestamp: number;
  response: string;
}

export function activate(context: vscode.ExtensionContext) {
  // Initialize or retrieve the response history from the global state
  let responseHistory: ResponseHistoryEntry[] =
    context.globalState.get("responseHistory") || [];

  // Create PackageExplorerDataProvider and register it with createTreeView
  const packageExplorerDataProvider = new PackageExplorerDataProvider("");
  vscode.window.createTreeView("package-explorer", {
    treeDataProvider: packageExplorerDataProvider,
  });

  let disposable = vscode.commands.registerCommand(
    "extension.configureAndSetupProject",
    async () => {
      // Check if API key is already stored in global state
      let openaiApiKey = context.globalState.get<string>("openaiApiKey");

      if (!openaiApiKey) {
        // If not stored, prompt the user to enter the API key
        openaiApiKey = await vscode.window.showInputBox({
          prompt: "Enter your OpenAI API key:",
          password: true,
        });

        if (!openaiApiKey) {
          // If the user cancels or doesn't provide a key, exit
          vscode.window.showWarningMessage(
            "No OpenAI API key entered. Enter a valid API to proceed."
          );
          return;
        }

        // Save the API key to global state for future use
        context.globalState.update("openaiApiKey", openaiApiKey);
      }

      // Continue with the project setup
      const userPrompt = await vscode.window.showInputBox({
        prompt: "Enter your prompt:",
      });

      if (userPrompt) {
        const customPrompt = `The following is the user prompt. You should give the complete code a noob needs to execute line by line,THERE SHOULD NOT BE ANY OTHER CHARACTER BEFORE COMMANDS IN EACH LINE: "${userPrompt}"`;

        try {
          const response = await generateSetupCommands(
            openaiApiKey,
            customPrompt,
            responseHistory
          );

          // Save the response to response history with a timestamp
          const timestamp = Date.now();
          responseHistory.push({ timestamp, response });

          // Limit the response history to the last two entries
          responseHistory = responseHistory.slice(-2);

          context.globalState.update("responseHistory", responseHistory);

          // Display the response in the Package Explorer view
          packageExplorerDataProvider.updateData(response);

          const lines = response.split("\n");

          // Use regular expressions to filter out lines that seem to be commands
          const commandLines = lines
            .map((line) => line.replace(/^\s*\d+[.)]\s*/, "")) // Remove leading numbers with dot or parenthesis
            .filter((line) => line.trim() !== ""); // Filter out empty lines after removal

          // Join the command lines into a single string
          const commandString = commandLines.join("\n");

          // Run the generated commands in the terminal
          const terminal = vscode.window.createTerminal("DevFlow Running");
          terminal.sendText(commandString);
          terminal.show();

          vscode.window.showInformationMessage("DevFlow Executed!");
        } catch (error: any) {
          vscode.window.showErrorMessage(
            `DevFlow failed to proceed: ${error.message}`
          );
        }
      } else {
        vscode.window.showWarningMessage(
          "No project description entered. Project setup canceled."
        );
      }
    }
  );

  // Add a command to clear the response history
  let clearHistoryDisposable = vscode.commands.registerCommand(
    "extension.clearResponseHistory",
    () => {
      responseHistory = [];
      context.globalState.update("responseHistory", responseHistory);
      vscode.window.showInformationMessage("Response history cleared.");
    }
  );

  context.subscriptions.push(disposable, clearHistoryDisposable);
}

class PackageExplorerDataProvider
  implements vscode.TreeDataProvider<PackageExplorerItem>
{
  private data: PackageExplorerItem[] = [];
  private output: string = "";

  constructor(output: string) {
    this.output = output;
    this.updateData(output);
  }

  updateData(output: string): void {
    // Clear existing data
    this.data = [];

    // Create a tree item with the output as its label
    const treeItem = new PackageExplorerItem(output);
    this.data.push(treeItem);

    // Refresh the view
    this.refresh();
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(null);
  }

  getTreeItem(
    element: PackageExplorerItem
  ): vscode.TreeItem | Thenable<vscode.TreeItem> {
    return element;
  }

  getChildren(
    element?: PackageExplorerItem
  ): vscode.ProviderResult<PackageExplorerItem[]> {
    return this.data;
  }

  // Event emitter for tree data changes
  private onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<PackageExplorerItem | null>();
  readonly onDidChangeTreeData: vscode.Event<PackageExplorerItem | null> =
    this.onDidChangeTreeDataEmitter.event;
}

class PackageExplorerItem extends vscode.TreeItem {
  constructor(public readonly label: string) {
    super(label, vscode.TreeItemCollapsibleState.None);
  }
}

async function generateSetupCommands(
  apiKey: string,
  projectDescription: string,
  responseHistory: ResponseHistoryEntry[]
): Promise<string> {
  const openaiApiEndpoint = "https://api.openai.com/v1/completions";
  const prompt = `Understand the user prompt and give ONLY terminal package installation codes. ${projectDescription}`;

  // Combine the current prompt with the context from response history
  const context = responseHistory.map((entry) => entry.response).join("\n");
  const combinedPrompt = `${prompt}\n\nPrevious responses:\n${context}`;

  try {
    const response = await axios.post(
      openaiApiEndpoint,
      {
        prompt: combinedPrompt,
        model: "text-davinci-003",
        max_tokens: 400,
      },
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    if (!response.data.choices || !Array.isArray(response.data.choices)) {
      throw new Error("Unexpected OpenAI API response format");
    }

    const generatedCommands = response.data.choices
      .map((choice: any) => choice.text.trim())
      .join("\n");
    return generatedCommands;
  } catch (error: any) {
    throw new Error(
      `Failed to generate setup commands from OpenAI API: ${error.message}`
    );
  }
}

export function deactivate() {}
``;
