import { configuration } from "./configuration";

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: Array<{
    type: string;
    text: {
      type: string;
      text: string;
    };
    style?: string;
    url?: string;
  }>;
}

export interface SlackMessage {
  blocks: SlackBlock[];
}

export const sendSlackNotification = async (
  message: SlackMessage
): Promise<void> => {
  if (!configuration.slack.webhookUrl) {
    console.warn("Slack webhook URL not configured, skipping notification");
    return;
  }

  try {
    const response = await fetch(configuration.slack.webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });

    if (!response.ok) {
      throw new Error(`Slack API error: ${response.statusText}`);
    }

    console.log("Slack notification sent successfully");
  } catch (error) {
    console.error("Failed to send Slack notification:", error);
  }
};

export const createReviewMessage = (
  originalCode: string,
  recommendation: string,
  explanation: string,
  actionUrl?: string
): SlackMessage => {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*AI Code Review Result*
        
*Original code:*

\`\`\`${originalCode}\`\`\`

*Recommendation:*
\`\`\`${recommendation}\`\`\`

*Explanation:* ${explanation}`,
      },
    },
  ];

  if (actionUrl) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Update now",
          },
          style: "primary",
          url: actionUrl,
        },
      ],
    });
  }

  return { blocks };
};
