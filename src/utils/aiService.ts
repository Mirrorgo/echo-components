// AI 服务工具类

// 基础消息接口
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// AI 服务响应接口
export interface AIResponse {
  content: string;
  success: boolean;
  error?: string;
}

// AI 服务配置接口
export interface AIServiceConfig {
  apiKey: string;
  modelName?: string;
}

// 定义各种 AI 服务的实现类型
export type AIServiceType = "qwen" | "openai" | "other";

// AI 服务工厂类
export class AIServiceFactory {
  // 创建 AI 服务实例
  static createService(
    type: AIServiceType,
    config: AIServiceConfig
  ): AIService {
    switch (type) {
      case "qwen":
        return new QwenService(config);
      case "openai":
        // 未来可以实现 OpenAI 服务
        throw new Error("OpenAI service not implemented yet");
      case "other":
        // 其他 AI 服务
        throw new Error("Other AI services not implemented yet");
      default:
        throw new Error(`Unknown AI service type: ${type}`);
    }
  }
}

// AI 服务抽象基类
export abstract class AIService {
  protected config: AIServiceConfig;

  constructor(config: AIServiceConfig) {
    this.config = config;
  }

  // 所有 AI 服务需要实现的方法
  abstract sendMessage(messages: ChatMessage[]): Promise<AIResponse>;
}

// 阿里云 Qwen 服务实现
export class QwenService extends AIService {
  constructor(config: AIServiceConfig) {
    super({
      ...config,
      modelName: config.modelName || "qwen-plus", // 默认使用 qwen-plus
    });
  }

  async sendMessage(messages: ChatMessage[]): Promise<AIResponse> {
    try {
      // 确保有系统提示
      let formattedMessages = [...messages];
      if (!formattedMessages.some((msg) => msg.role === "system")) {
        formattedMessages.unshift({
          role: "system",
          content: "You are a helpful assistant.",
        });
      }
      // 柏拉图ai的url, 其他地址可查看 https://bltcy.cn/docs/tutorial/address.html
      // const BASE_URL = "api.bltcy.ai"
      const BASE_URL = "apis.bltcy.ai";

      const response = await fetch(
        // `https://${BASE_URL}/compatible-mode/v1/chat/completions`,
        `https://${BASE_URL}/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: this.config.modelName,
            messages: formattedMessages,
          }),
        }
      );

      const data = await response.json();

      if (data.choices && data.choices.length > 0) {
        return {
          content: data.choices[0].message.content,
          success: true,
        };
      } else {
        return {
          content: "",
          success: false,
          error: data.error?.message || "Unknown API error",
        };
      }
    } catch (error) {
      return {
        content: "",
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to connect to the API",
      };
    }
  }
}

// 简单的快捷调用方法
export async function callAI(
  messages: ChatMessage[],
  type: AIServiceType = "qwen",
  config: AIServiceConfig
): Promise<AIResponse> {
  const service = AIServiceFactory.createService(type, config);
  return await service.sendMessage(messages);
}
