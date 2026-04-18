import { Disposable, WebviewPanel, window, ViewColumn, commands, Uri, Webview, ExtensionContext, env } from "vscode";
import * as fse from 'fs-extra';
import * as path from 'path';
import { getNonce } from "../webviewUtils";

/**
     * Render markdown string to html string
     */
const MARKDOWN_API_RENDER = 'markdown.api.render';
const DOCUMENTATION_PAGES = ["README", "GettingStarted", "Explorer", "KafkaFile", "Producing", "Consuming"] as const;
const VALID_DOCUMENTATION_SECTION = /^[A-Za-z0-9-]*$/;

type DocumentationPage = typeof DOCUMENTATION_PAGES[number];

export const OPEN_DOCUMENTATION_PAGE_COMMAND = "vscode-kafka.open.docs.page";

function buildDocumentationPageUri(page: string, section: string): string {
    return `command:${OPEN_DOCUMENTATION_PAGE_COMMAND}?${encodeURIComponent(JSON.stringify([{ page, section }]))}`;
}

export function normalizeDocumentationPage(page: string): DocumentationPage | undefined {
    const normalizedPage = page.endsWith(".md") ? page.slice(0, -3) : page;
    return (DOCUMENTATION_PAGES as readonly string[]).includes(normalizedPage)
        ? normalizedPage as DocumentationPage
        : undefined;
}

export function normalizeDocumentationSection(section: string | undefined): string | undefined {
    const normalizedSection = section || "";
    return VALID_DOCUMENTATION_SECTION.test(normalizedSection)
        ? normalizedSection
        : undefined;
}

export function getDocumentationPagePath(extensionPath: string, page: DocumentationPage): string {
    return path.join(extensionPath, "docs", `${page}.md`);
}

class MarkdownPreviewProvider implements Disposable {
    private panel: WebviewPanel | undefined;
    // a cache maps document path to rendered html
    private documentCache: Map<string, string> = new Map<string, string>();
    private disposables: Disposable[] = [];

    public async show(markdownFilePath: string, title: string, section: string, context: ExtensionContext): Promise<void> {
        if (!this.panel) {
            this.panel = window.createWebviewPanel('vscode-kafka.markdownPreview', title, ViewColumn.Active, {
                localResourceRoots: [
                    Uri.joinPath(context.extensionUri, 'webview-resources'),
                    Uri.joinPath(context.extensionUri, 'docs'),
                ],
                retainContextWhenHidden: true,
                enableFindWidget: true,
                enableScripts: true,
                enableCommandUris: [OPEN_DOCUMENTATION_PAGE_COMMAND]
            });
        }

        this.disposables.push(this.panel.onDidDispose(() => {
            this.panel = undefined;
        }));

        this.panel.iconPath = Uri.file(path.join(context.extensionPath, 'icons', 'icon128.png'));
        this.panel.webview.html = await this.getHtmlContent(this.panel.webview, markdownFilePath, section, context);
        this.panel.title = title;
        this.panel.reveal(this.panel.viewColumn);
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
        for (const disposable of this.disposables) {
            disposable.dispose();
        }
    }

    protected async getHtmlContent(webview: Webview, markdownFilePath: string, section: string, context: ExtensionContext): Promise<string> {
        const nonce: string = getNonce();
        const styles: string = this.getStyles(webview, context);
        let body: string | undefined = this.documentCache.get(markdownFilePath);
        if (!body) {
            let markdownString: string = await fse.readFile(markdownFilePath, 'utf8');
            markdownString = markdownString.replace(/__VSCODE_ENV_APPNAME_PLACEHOLDER__/, env.appName);
            // HACK: This will not replace cross-page links if they don't have a section
            // i.e. [here](OtherPage#section) gets replaced, but [here](OtherPage) doesn't
            // Captures markdown links like this: [$1]($2#$3)
            // where $1, $2, $3 are non empty strings that are then passed to the replace function
            markdownString = markdownString.replace(/\[([^\]]+)\]\(([^#)]+)#([^)]*)\)/g,
                (_match: string, linkText: string, page: string, section: string) => {
                    return `<a href="${buildDocumentationPageUri(page, section)}">${linkText}</a>`;
                });
            body = await commands.executeCommand(MARKDOWN_API_RENDER, markdownString);
            if (body !== undefined) {
                this.documentCache.set(markdownFilePath, body);
            }
        }
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src 'self' ${webview.cspSource} https: data:; script-src 'nonce-${nonce}';"/>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                ${styles}
                <base href="${webview.asWebviewUri(Uri.file(markdownFilePath))}">
            </head>
            <body class="vscode-body scrollBeyondLastLine wordWrap showEditorSelection">
                ${body}
                <button class="btn floating-bottom-right" id="back-to-top-btn">
                    <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
                        <path fill-rule="evenodd" clip-rule="evenodd" d="M8 6.04042L3.02022 11.0202L2.31311 10.3131L7.64644 4.97976L8.35355 4.97976L13.6869 10.3131L12.9798 11.0202L8 6.04042Z"/>
                    </svg>
                </button>
                <script nonce="${nonce}">
                    (function() {
                        const sectionPrefix = ${JSON.stringify(section)};
                        if (sectionPrefix.length > 0) {
                            var element = document.querySelector('[id^="' + sectionPrefix + '"]');
                            if (element) {
                                element.scrollIntoView(true);
                            }
                        }
                        var backToTopBtn = document.getElementById('back-to-top-btn');
                        if (backToTopBtn) {
                            backToTopBtn.onclick = () => document.documentElement.scrollTop = 0;
                        }
                    })();
                </script>
            </body>
            </html>
        `;
    }

    protected getStyles(webview: Webview, context: ExtensionContext): string {
        const styles: Uri[] = [
            Uri.file(path.join(context.extensionPath, 'webview-resources', 'highlight.css')),
            Uri.file(path.join(context.extensionPath, 'webview-resources', 'markdown.css')),
            Uri.file(path.join(context.extensionPath, 'webview-resources', 'document.css')),
        ];
        return styles.map((styleUri: Uri) => `<link rel="stylesheet" type="text/css" href="${webview.asWebviewUri(styleUri).toString()}">`).join('\n');
    }
}

export const markdownPreviewProvider: MarkdownPreviewProvider = new MarkdownPreviewProvider();

export type EmbeddedPage = "Consuming" | "Producing";

type ConsumingSection = "deserializer" | "kafka-file";

type ProducingSection = "serializer" | "kafka-file" | "randomized-content";

export type EmbeddedSection = ConsumingSection | ProducingSection;

export function getDocumentationPageUri(page: EmbeddedPage, section: EmbeddedSection) {
    return buildDocumentationPageUri(page, section);
}
