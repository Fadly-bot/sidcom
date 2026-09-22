import { IDatabase } from '../db/index.js';
import { QuestionAnswerSubmission, QuestionGradingDetail } from './types.js';

interface DbQuestionOption {
  question_id: string;
  option_id: string;
  is_correct: boolean;
  explanation_text: string;
}

export interface AuthoritativeGrading {
  totalQuestions: number;
  correctQuestions: number;
  scorePercentage: number;
  passed: boolean;
  questionDetails: QuestionGradingDetail[];
}

export class GradingEngine {
  constructor(private db: IDatabase) {}

  async gradeQuiz(
    lessonId: string,
    answers: QuestionAnswerSubmission[]
  ): Promise<AuthoritativeGrading> {
    // 1. Fetch quiz for lesson
    const quizRes = await this.db.query<{ id: string; passing_threshold_percentage: number }>(
      'SELECT id, passing_threshold_percentage FROM quizzes WHERE lesson_id = $1;',
      [lessonId]
    );

    if (quizRes.rows.length === 0) {
      // If lesson does not have a multiple-choice quiz (e.g. purely reflective or external rubric),
      // grade as 100% if submission was received with answers
      return {
        totalQuestions: 1,
        correctQuestions: 1,
        scorePercentage: 100.0,
        passed: true,
        questionDetails: []
      };
    }

    const quiz = quizRes.rows[0];
    if (!quiz) {
      return {
        totalQuestions: 1,
        correctQuestions: 1,
        scorePercentage: 100.0,
        passed: true,
        questionDetails: []
      };
    }
    const threshold = Number(quiz.passing_threshold_percentage ?? 80.0);

    // 2. Fetch all questions and answer options for this quiz
    const optionsRes = await this.db.query<DbQuestionOption>(
      `SELECT q.id as question_id, ao.id as option_id, ao.is_correct, ao.explanation_text
       FROM questions q
       JOIN answer_options ao ON ao.question_id = q.id
       WHERE q.quiz_id = $1
       ORDER BY q.sequence_order ASC;`,
      [quiz.id]
    );

    if (optionsRes.rows.length === 0) {
      return {
        totalQuestions: 0,
        correctQuestions: 0,
        scorePercentage: 0.0,
        passed: false,
        questionDetails: []
      };
    }

    // Group options by question
    const questionMap = new Map<string, { correctOptionIds: Set<string>; explanations: string[] }>();
    for (const row of optionsRes.rows) {
      let q = questionMap.get(row.question_id);
      if (!q) {
        q = { correctOptionIds: new Set<string>(), explanations: [] };
        questionMap.set(row.question_id, q);
      }
      if (row.is_correct) {
        q.correctOptionIds.add(row.option_id);
      }
      if (row.explanation_text && !q.explanations.includes(row.explanation_text)) {
        q.explanations.push(row.explanation_text);
      }
    }

    const answersMap = new Map<string, string[]>();
    for (const ans of answers) {
      answersMap.set(ans.question_id, ans.selected_option_ids);
    }

    let correctCount = 0;
    const totalQuestions = questionMap.size;
    const questionDetails: QuestionGradingDetail[] = [];

    for (const [qId, qData] of questionMap.entries()) {
      const selected = answersMap.get(qId) ?? [];
      const selectedSet = new Set(selected);

      // Must select all correct and no incorrect
      const isMatch =
        selectedSet.size === qData.correctOptionIds.size &&
        [...qData.correctOptionIds].every((id) => selectedSet.has(id));

      if (isMatch) {
        correctCount += 1;
      }

      questionDetails.push({
        question_id: qId,
        correct: isMatch,
        correct_option_ids: Array.from(qData.correctOptionIds),
        explanation: qData.explanations.join(' ')
      });
    }

    const scorePercentage = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passed = scorePercentage >= threshold;

    return {
      totalQuestions,
      correctQuestions: correctCount,
      scorePercentage: Math.round(scorePercentage * 100) / 100,
      passed,
      questionDetails
    };
  }
}
