import { useState } from 'react';
import styles from './MessageList.module.css';

// ---- Helper to extract raw text from React children ----
function extractText(node: any): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join('');
  if (node.props) {
    if (node.props.children) {
      return extractText(node.props.children);
    }
    if (node.props.value) {
      return String(node.props.value);
    }
  }
  return '';
}

// ---- Beautiful CodeBlock Component with Header and Copy Button ----
export function CodeBlock({ children }: { children: any }) {
  const [copied, setCopied] = useState(false);

  // Extract the code element
  const codeElement = children && children.type === 'code' ? children : null;
  const className = codeElement ? codeElement.props.className || '' : '';
  const match = /language-(\w+)/.exec(className);
  const language = match ? match[1] : 'text';

  // Extract raw text for copying
  const rawCode = codeElement ? extractText(codeElement.props.children) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawCode.trim());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code: ', err);
    }
  };

  return (
    <div className={styles.codeBlockContainer}>
      <div className={styles.codeBlockHeader}>
        <span className={styles.codeBlockLanguage}>{language}</span>
        <button
          className={styles.copyButton}
          onClick={handleCopy}
          aria-label={copied ? '代码已复制到剪贴板' : '复制代码到剪贴板'}
          aria-pressed={copied}
        >
          {copied ? (
            <>
              <span className={styles.copyIcon}>✓</span>
              <span>已复制</span>
            </>
          ) : (
            <>
              <span className={styles.copyIcon}>📋</span>
              <span>复制</span>
            </>
          )}
        </button>
      </div>
      <pre className={styles.codeBlockPre}>
        {children}
      </pre>
    </div>
  );
}
