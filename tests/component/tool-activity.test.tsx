import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import ToolActivity from '@/components/ToolActivity';
import MessageLog from '@/components/MessageLog';
import type { ToolCallRecord } from '@/lib/conversation/stream-types';
import type { Message } from '@/lib/conversation/limits';

describe('ToolActivity Component (US9, T031, T032, FR-027, FR-028, FR-029, FR-030)', () => {
  const baseToolCall: ToolCallRecord = {
    id: 'call-1',
    toolCallId: 'call-1',
    toolCallIndex: 0,
    toolName: 'get_weather',
    argsAccumulator: '{"location":"Tokyo"}',
    parsedArgs: { location: 'Tokyo' },
    status: 'completed',
    startTime: 1000,
    endTime: 1500,
    result: { temperature: 22, condition: 'Sunny' },
    error: null,
  };

  it('renders nothing when toolCalls is empty', () => {
    const { container } = render(<ToolActivity toolCalls={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a parent details accordion that starts closed', () => {
    render(<ToolActivity toolCalls={[baseToolCall]} />);

    const details = screen.getByTestId('tool-activity') as HTMLDetailsElement;
    expect(details.tagName.toLowerCase()).toBe('details');
    expect(details.open).toBe(false);
  });

  it('displays `Using "{toolName}"...` title during generating phase', () => {
    const generatingTool: ToolCallRecord = {
      ...baseToolCall,
      toolName: 'calculator',
      status: 'generating_args',
      result: null,
      endTime: null,
    };

    render(<ToolActivity toolCalls={[generatingTool]} />);

    const summary = screen.getByTestId('tool-activity-summary');
    expect(summary.textContent).toContain('Using "calculator"...');
  });

  it('displays `Tool finished` title when all tools completed successfully', () => {
    render(<ToolActivity toolCalls={[baseToolCall]} />);

    const summary = screen.getByTestId('tool-activity-summary');
    expect(summary.textContent).toContain('Tool finished');
  });

  it('displays `Tool failed` title with a red border when any tool fails', () => {
    const failedTool: ToolCallRecord = {
      ...baseToolCall,
      status: 'failed',
      error: 'Network timeout',
    };

    render(<ToolActivity toolCalls={[failedTool]} />);

    const summary = screen.getByTestId('tool-activity-summary');
    expect(summary.textContent).toContain('Tool failed');

    const details = screen.getByTestId('tool-activity');
    expect(details.className).toContain('border-red-500');
  });

  it('formats and pretty-prints JSON arguments with indentation', () => {
    render(<ToolActivity toolCalls={[baseToolCall]} />);

    const argsBlock = screen.getByTestId('tool-args');
    expect(argsBlock.textContent).toContain('"location": "Tokyo"');
  });

  it('formats and pretty-prints JSON result when result is present', () => {
    render(<ToolActivity toolCalls={[baseToolCall]} />);

    const resultBlock = screen.getByTestId('tool-result');
    expect(resultBlock.textContent).toContain('"temperature": 22');
    expect(resultBlock.textContent).toContain('"condition": "Sunny"');
  });

  it('falls back to raw argsAccumulator string if arguments are incomplete JSON during streaming', () => {
    const partialTool: ToolCallRecord = {
      ...baseToolCall,
      argsAccumulator: '{"location":"Tok',
      parsedArgs: null,
      status: 'generating_args',
    };

    render(<ToolActivity toolCalls={[partialTool]} />);

    const argsBlock = screen.getByTestId('tool-args');
    expect(argsBlock.textContent).toContain('{"location":"Tok');
  });

  it('groups multiple tool calls in a single parent accordion', () => {
    const toolCalls: ToolCallRecord[] = [
      { ...baseToolCall, id: 'call-1', toolName: 'search' },
      { ...baseToolCall, id: 'call-2', toolName: 'fetch' },
    ];

    render(<ToolActivity toolCalls={toolCalls} />);

    const details = screen.getAllByTestId('tool-activity');
    expect(details.length).toBe(1);

    expect(screen.getByText('search')).toBeTruthy();
    expect(screen.getByText('fetch')).toBeTruthy();
  });

  it('integrates with MessageLog: renders ToolActivity at top of bubble and normal text below', () => {
    const messageWithTool: Message = {
      id: 'msg-1',
      author: 'character',
      text: 'The weather in Tokyo is 22°C and sunny.',
      status: 'completed',
      toolCalls: [baseToolCall],
    };

    render(<MessageLog messages={[messageWithTool]} />);

    const toolActivity = screen.getByTestId('tool-activity');
    expect(toolActivity).toBeTruthy();

    const normalText = screen.getByText('The weather in Tokyo is 22°C and sunny.');
    expect(normalText).toBeTruthy();

    // Verify toolActivity appears before normalText in the DOM tree
    expect(
      toolActivity.compareDocumentPosition(normalText) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('remains visible in MessageLog after the response text finishes generating (status: completed)', () => {
    // 1. Initially streaming
    const streamingMsg: Message = {
      id: 'msg-1',
      author: 'character',
      text: 'Thinking with tool...',
      status: 'streaming',
      toolCalls: [baseToolCall],
    };

    const { rerender } = render(<MessageLog messages={[streamingMsg]} />);
    expect(screen.getByTestId('tool-activity')).toBeTruthy();

    // 2. Response completed
    const completedMsg: Message = {
      ...streamingMsg,
      text: 'Final response generated by Aria.',
      status: 'completed',
      toolCalls: [baseToolCall],
    };

    rerender(<MessageLog messages={[completedMsg]} />);

    // Accordion must still be visible and accountable to the user!
    const toolActivity = screen.getByTestId('tool-activity');
    expect(toolActivity).toBeTruthy();
    expect(screen.getByText('Tool finished')).toBeTruthy();
    expect(screen.getByText('Final response generated by Aria.')).toBeTruthy();
  });

  it('updates title to current active tool and appends previous tool name, args, and result in content', () => {
    const tool1: ToolCallRecord = {
      id: 'call-1',
      toolCallId: 'call-1',
      toolCallIndex: 0,
      toolName: 'get_weather',
      argsAccumulator: '{"city":"Tokyo"}',
      parsedArgs: { city: 'Tokyo' },
      status: 'completed',
      startTime: 1000,
      endTime: 1200,
      result: { temp: 22 },
      error: null,
    };

    const tool2Generating: ToolCallRecord = {
      id: 'call-2',
      toolCallId: 'call-2',
      toolCallIndex: 1,
      toolName: 'convert_units',
      argsAccumulator: '{"temp":22,"to":"F"}',
      parsedArgs: { temp: 22, to: 'F' },
      status: 'generating_args',
      startTime: 1300,
      endTime: null,
      result: null,
      error: null,
    };

    // When tool 2 is being called while tool 1 is completed
    const { rerender } = render(<ToolActivity toolCalls={[tool1, tool2Generating]} />);

    // Title displays current active tool name
    const summary = screen.getByTestId('tool-activity-summary');
    expect(summary.textContent).toContain('Using "convert_units"...');

    // Content displays tool 1 name, arguments, and result
    const items = screen.getAllByTestId('tool-call-item');
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toContain('get_weather');
    expect(items[0]!.textContent).toContain('"city": "Tokyo"');
    expect(items[0]!.textContent).toContain('"temp": 22');

    // And appends tool 2 name and arguments
    expect(items[1]!.textContent).toContain('convert_units');
    expect(items[1]!.textContent).toContain('"to": "F"');

    // When tool 2 finishes
    const tool2Completed: ToolCallRecord = {
      ...tool2Generating,
      status: 'completed',
      endTime: 1500,
      result: { converted: 71.6 },
    };

    rerender(<ToolActivity toolCalls={[tool1, tool2Completed]} />);

    // Title turns to Tool finished
    expect(screen.getByTestId('tool-activity-summary').textContent).toContain('Tool finished');

    // Content still contains both tools and their results
    const completedItems = screen.getAllByTestId('tool-call-item');
    expect(completedItems).toHaveLength(2);
    expect(completedItems[0]!.textContent).toContain('get_weather');
    expect(completedItems[0]!.textContent).toContain('"temp": 22');
    expect(completedItems[1]!.textContent).toContain('convert_units');
    expect(completedItems[1]!.textContent).toContain('"converted": 71.6');
  });
});
