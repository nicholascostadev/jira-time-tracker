import { Box, Text, t, bold, fg, type CliRenderer, type KeyEvent } from '@opentui/core';
import { colors } from './theme.js';
import { Spinner } from './components.js';

export function clearRenderer(renderer: CliRenderer): void {
  while (renderer.root.getChildrenCount() > 0) {
    const children = renderer.root.getChildren();
    if (children.length > 0) {
      renderer.root.remove(children[0].id);
    }
  }
}

export function showErrorScreen(
  renderer: CliRenderer,
  errorMessage: string
): Promise<'retry' | 'quit'> {
  return new Promise((resolve) => {
    renderer.keyInput.removeAllListeners('keypress');

    const ui = Box(
      {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        padding: 1,
        backgroundColor: colors.bg,
      },
      Box(
        {
          width: '100%',
          height: 3,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          borderStyle: 'rounded',
          borderColor: colors.border,
          border: true,
          marginBottom: 1,
        },
        Text({ content: t`${bold(fg(colors.text)('JIRA TIME TRACKER'))}` })
      ),
      Box(
        {
          width: '100%',
          flexGrow: 1,
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          borderStyle: 'rounded',
          borderColor: colors.error,
          border: true,
        },
        Text({ content: 'SOMETHING WENT WRONG', fg: colors.error }),
        Text({ content: errorMessage, fg: colors.textMuted }),
        Box(
          {
            flexDirection: 'row',
            gap: 3,
            marginTop: 1,
          },
          Text({ content: '[r] retry', fg: colors.text }),
          Text({ content: '[q] quit', fg: colors.textDim })
        )
      )
    );

    clearRenderer(renderer);
    renderer.root.add(ui);

    renderer.keyInput.on('keypress', (key: KeyEvent) => {
      const keyName = key.name?.toLowerCase();
      if (keyName === 'r') {
        resolve('retry');
      } else if (keyName === 'q' || keyName === 'escape') {
        resolve('quit');
      }
    });
  });
}

export async function showLoadingScreen<T>(
  renderer: CliRenderer,
  message: string,
  task: () => Promise<T>
): Promise<T> {
  while (true) {
    let spinnerIndex = 0;
    let spinnerInterval: Timer | null = null;

    renderer.keyInput.removeAllListeners('keypress');

    const renderLoading = () => {
      clearRenderer(renderer);
      renderer.root.add(
        Box(
          {
            width: '100%',
            height: '100%',
            flexDirection: 'column',
            padding: 1,
            backgroundColor: colors.bg,
          },
          Box(
            {
              width: '100%',
              height: 3,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
              marginBottom: 1,
            },
            Text({ content: t`${bold(fg(colors.text)('JIRA TIME TRACKER'))}` })
          ),
          Box(
            {
              width: '100%',
              flexGrow: 1,
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderStyle: 'rounded',
              borderColor: colors.border,
              border: true,
            },
            Spinner(spinnerIndex),
            Box(
              { marginTop: 1 },
              Text({ content: message, fg: colors.textMuted })
            )
          )
        )
      );
    };

    renderLoading();
    spinnerInterval = setInterval(() => {
      spinnerIndex++;
      renderLoading();
    }, 300);

    try {
      const result = await task();
      clearInterval(spinnerInterval);
      return result;
    } catch (error) {
      if (spinnerInterval) {
        clearInterval(spinnerInterval);
      }

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const userAction = await showErrorScreen(renderer, errorMessage);
      if (userAction === 'retry') {
        continue;
      }

      renderer.destroy();
      console.log('\nCancelled.\n');
      process.exit(1);
    }
  }
}
