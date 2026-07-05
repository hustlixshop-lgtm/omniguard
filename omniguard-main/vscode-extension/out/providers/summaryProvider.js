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
exports.SummaryItem = exports.SummaryProvider = void 0;
const vscode = __importStar(require("vscode"));
class SummaryProvider {
    scanManager;
    _onDidChangeTreeData = new vscode.EventEmitter();
    onDidChangeTreeData = this._onDidChangeTreeData.event;
    constructor(scanManager) {
        this.scanManager = scanManager;
    }
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    getTreeItem(element) {
        return element;
    }
    getChildren(element) {
        if (element) {
            return Promise.resolve([]);
        }
        const summary = this.scanManager.getSummary();
        return Promise.resolve([
            new SummaryItem('🔴 Critical', summary.critical.toString(), 'critical'),
            new SummaryItem('🟠 High', summary.high.toString(), 'high'),
            new SummaryItem('🟡 Medium', summary.medium.toString(), 'medium'),
            new SummaryItem('🔵 Low', summary.low.toString(), 'low'),
            new SummaryItem('⚪ Info', summary.info.toString(), 'info'),
            new SummaryItem('', '', 'spacer'),
            new SummaryItem('Total', summary.total.toString(), 'total'),
        ]);
    }
}
exports.SummaryProvider = SummaryProvider;
class SummaryItem extends vscode.TreeItem {
    label;
    count;
    type;
    constructor(label, count, type) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.count = count;
        this.type = type;
        this.description = count;
        this.contextValue = 'summary';
        if (type === 'spacer') {
            this.label = '─'.repeat(20);
        }
        if (type === 'total') {
            this.iconPath = new vscode.ThemeIcon('graph');
        }
    }
}
exports.SummaryItem = SummaryItem;
//# sourceMappingURL=summaryProvider.js.map