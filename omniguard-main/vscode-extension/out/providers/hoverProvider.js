"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HoverProvider = void 0;
const vscode = __importStar(require("vscode"));
const types_1 = require("../types");
class HoverProvider {
    scanManager;
    constructor(scanManager) {
        this.scanManager = scanManager;
    }
    provideHover(document, position, token) {
        const findings = this.scanManager.getFindingsForFile(document.uri.fsPath);
        const line = position.line + 1;
        const findingsAtLine = findings.filter(f => f.line_start <= line && (f.line_end || f.line_start) >= line);
        if (findingsAtLine.length === 0) {
            return undefined;
        }
        const contents = findingsAtLine.map(f => this.formatFindingHover(f)).join('\n\n---\n\n');
        return new vscode.Hover(new vscode.MarkdownString(contents));
    }
    formatFindingHover(finding) {
        const icon = types_1.SEVERITY_ICONS[finding.severity];
        let content = `## ${icon} ${finding.title}

**Severity:** ${finding.severity.toUpperCase()}
**Scanner:** ${finding.scanner}
**Rule:** \`${finding.rule_id}\` - ${finding.rule_name}

${finding.description}`;
        if (finding.evidence) {
            content += `

\`\`\`
${finding.evidence}
\`\`\``;
        }
        if (finding.remediation) {
            content += `

**Remediation:**
${finding.remediation}`;
        }
        if (finding.ai_remediation) {
            content += `

**AI Suggested Fix:**
\`\`\`
${finding.ai_remediation}
\`\`\``;
        }
        if (finding.owasp.length > 0) {
            content += `

**OWASP:** ${finding.owasp.join(', ')}`;
        }
        if (finding.cwe.length > 0) {
            content += `

**CWE:** ${finding.cwe.join(', ')}`;
        }
        return content;
    }
}
exports.HoverProvider = HoverProvider;
//# sourceMappingURL=hoverProvider.js.map