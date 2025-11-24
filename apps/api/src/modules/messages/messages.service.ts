import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '@/infra/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { CustomerMessage, MessageCategory } from '@prisma/client';
import OpenAI from 'openai';

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);
  private openai: OpenAI | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');
    if (apiKey) {
      this.openai = new OpenAI({ apiKey });
    } else {
      this.logger.warn('OPENAI_API_KEY is not configured. AI analysis will be disabled.');
    }
  }

  async analyzeMessage(id: string): Promise<CustomerMessage> {
    const message = await this.prisma.customerMessage.findUnique({
      where: { id },
    });

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    if (message.analyzedAt) {
      this.logger.log(`Message ${id} already analyzed at ${message.analyzedAt}. Skipping.`);
      return message;
    }
    
    if (!this.openai) {
      this.logger.warn(`OpenAI is not configured. Skipping analysis for message ${id}.`);
      return message;
    }

    const textToAnalyze = `Subject: ${message.subject || 'empty'}\n\nBody: ${message.body || 'empty'}`;

    try {
      this.logger.log(`Analyzing message ${id}...`);
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: `You are an email analysis expert for a CRM. Analyze the email and return a JSON object with 'sentiment' ('positive', 'neutral', 'negative'), 'urgency' ('low', 'medium', 'high'), 'category' ('Angebot', 'Kritisch', 'Kündigung', 'Werbung', 'Sonstiges'), and a one-sentence 'summary'. Respond only with the JSON object.`,
          },
          { role: 'user', content: textToAnalyze },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });

      const messageContent = response.choices[0].message.content;
      if (!messageContent) {
        this.logger.warn(`OpenAI returned no content for message ${id}. Skipping analysis.`);
        return message;
      }
      const result = JSON.parse(messageContent);
      this.logger.log(`AI analysis result for ${id}: ${JSON.stringify(result)}`);

      const categoryMap: Record<string, MessageCategory> = {
        'Angebot': MessageCategory.ANGEBOT,
        'Kritisch': MessageCategory.KRITISCH,
        'Kündigung': MessageCategory.KUENDIGUNG,
        'Werbung': MessageCategory.WERBUNG,
        'Sonstiges': MessageCategory.SONSTIGES,
      };

      const updatedMessage = await this.prisma.customerMessage.update({
        where: { id },
        data: {
          sentiment: result.sentiment,
          urgency: result.urgency,
          category: categoryMap[result.category] || MessageCategory.SONSTIGES,
          summary: result.summary,
          analyzedAt: new Date(),
        },
      });

      return updatedMessage;
    } catch (error) {
      this.logger.error(`Failed to analyze message ${id} with OpenAI:`, error);
      // Don't throw error to client, just return original message
      return message;
    }
  }
}
