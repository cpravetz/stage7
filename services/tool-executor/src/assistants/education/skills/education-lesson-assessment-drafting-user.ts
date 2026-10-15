// @ts-nocheck

import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

/**
 * User half of the education-lesson-assessment-drafting split. It was
 * event-triggered ("A submission is received for grading") while requiring
 * task/subject/topic, which a grading event does not supply, so the trigger
 * over-promised. This half is user-triggered; the scheduled half
 * (education-lesson-assessment-drafting-scheduled) covers configured courses.
 */
export const LESSON_ASSESSMENT_DRAFTING_USER = createDeclarativeCodeSkill({
  id: 'education-lesson-assessment-drafting-user',
  name: 'Lesson & Assessment Drafting',
  description: 'Drafts lesson plans, quizzes, activities, and multimedia-integrated content for a teacher to review, from the subject and topic you give it.',
  persistenceEnvVar: 'ASSISTANT_HOME',
  tier: 'represent',
  emitEvent: 'education.drafting.drafted',
  isSkill: true,
  domainKnowledge: 'Curriculum standards alignment, lesson design, assessment authoring, and rubric construction for teacher review',
  inputSchema: {
    type: 'object',
    properties: {
      task: SchemaProps.select(['lesson-plan', 'quiz', 'activity', 'content', 'multimedia'], { description: 'What to draft' }),
      subject: SchemaProps.text({ description: 'Subject area (e.g., Mathematics, Science, ELA, History)' }),
      grade: SchemaProps.text({ description: 'Grade level (e.g., "5", "9-10", "11-12")' }),
      topic: SchemaProps.text({ description: 'Specific topic or unit' }),
      duration: SchemaProps.number({ description: 'Lesson duration in minutes', default: 60 }),
      standards: SchemaProps.stringArray({ description: 'Curriculum standards codes (e.g., CCSS.MATH.CONTENT.5.NF.A.1)' }),
      objectives: SchemaProps.stringArray({ description: 'Learning objectives (will generate from Bloom\'s if empty)' }),
      learnerProfile: { type: 'object', description: 'Learner context: reading level, interests, accommodations, prior knowledge' },
      quizType: SchemaProps.select(['multiple-choice', 'mixed', 'formative', 'summative'], { description: 'Quiz format', default: 'mixed' }),
      questionCount: SchemaProps.number({ description: 'Number of questions', default: 10 }),
      difficulty: SchemaProps.select(['easy', 'medium', 'hard', 'mixed'], { description: 'Difficulty level', default: 'medium' }),
      activityType: SchemaProps.select(['discussion', 'group-work', 'lab', 'project-based', 'game', 'simulation', 'writing', 'digital-creation'], { description: 'Activity type', default: 'discussion' }),
      multimedia: SchemaProps.stringArray({ description: 'Multimedia elements to integrate: video, simulation, audio, interactive, vr-ar' }),
      contentFormat: SchemaProps.select(['handout', 'slide-deck', 'worksheet', 'study-guide', 'anchor-chart'], { description: 'Content format', default: 'handout' }),
    },
    required: ['task', 'subject', 'topic'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the draft was generated and stored' },
      data: { type: ['object', 'null'], description: 'Generated draft, or null when generation fails' },
      error: { type: 'string', description: 'Validation or generation error when unsuccessful' },
    },
    required: ['success'],
  },
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Draft a lesson plan on fractions',
        'Write a quiz for this unit',
        'Create a group activity for this topic',
      ],
    },
  ],
  manifest: {
    lowerOrderTools: [
      'education-assessment-content-generator',
      'education-assessment-content-reviewer',
    ],
    timeoutMs: 300_000,
  },
  handler: async function handler(input, ctx) {
      const task = input.task || 'lesson-plan';
      const subject = input.subject || '';
      const grade = input.grade || '';
      const topic = input.topic || '';
      const duration = input.duration || 60;
      const standards = input.standards || [];
      const objectives = input.objectives || [];
      const learnerProfile = input.learnerProfile || {};
      const quizType = input.quizType || 'mixed';
      const difficulty = input.difficulty || 'medium';
      const activityType = input.activityType || 'discussion';
      const multimedia = input.multimedia || [];

      const store = ctx.store.load('drafts', []);

      const draft = { id: 'edu_draft_' + Date.now(), task, subject, grade, topic, duration, standards, objectives, createdAt: new Date().toISOString(), source: 'reasoning' };

      const bloomLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
      const bloomsVerbs = {
        Remember: ['list', 'define', 'identify', 'recall', 'name', 'state'],
        Understand: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
        Apply: ['solve', 'demonstrate', 'use', 'illustrate', 'construct', 'execute'],
        Analyze: ['analyze', 'differentiate', 'organize', 'attribute', 'deconstruct', 'examine'],
        Evaluate: ['evaluate', 'critique', 'justify', 'defend', 'assess', 'rank'],
        Create: ['design', 'construct', 'produce', 'invent', 'formulate', 'generate'],
      };

      if (task === 'lesson-plan') {
        const phases = [
          { name: 'Warm-up / Hook', minutes: Math.max(5, Math.floor(duration * 0.1)), description: 'Activate prior knowledge, pose essential question' },
          { name: 'Direct Instruction', minutes: Math.max(10, Math.floor(duration * 0.25)), description: 'Model new concept, think-aloud, guided examples' },
          { name: 'Guided Practice', minutes: Math.max(15, Math.floor(duration * 0.35)), description: 'Students practice with scaffolding, teacher feedback' },
          { name: 'Independent Practice', minutes: Math.max(15, Math.floor(duration * 0.2)), description: 'Students apply independently, differentiation options' },
          { name: 'Closure / Exit Ticket', minutes: Math.max(5, Math.floor(duration * 0.1)), description: 'Check understanding, preview next lesson' },
        ];

        const materials = ['Whiteboard/projector', 'Student notebooks', 'Handouts/worksheets', ...multimedia];
        if (multimedia.length) materials.push(...multimedia.map(m => `Multimedia: ${m}`));

        draft.lessonPlan = {
          title: `${subject} - ${grade}: ${topic}`,
          grade,
          subject,
          duration: `${duration} minutes`,
          standards,
          objectives: objectives.length ? objectives : bloomLevels.slice(0, 3).map((level) => `${bloomsVerbs[level][0].charAt(0).toUpperCase() + bloomsVerbs[level][0].slice(1)} ${topic} (${level})`),
          phases,
          materials,
          differentiation: {
            support: ['Sentence frames', 'Visual aids', 'Peer pairing', 'Chunked instructions'],
            extension: ['Challenge problems', 'Real-world application', 'Peer teaching', 'Creative synthesis'],
          },
          assessment: 'Formative: exit ticket + observation. Summative: aligned quiz/project.',
          homework: `Practice ${topic} with ${activityType} activity`,
          reflection: 'Post-lesson: What worked? What needs adjustment? Student engagement level?',
        };
      } else if (task === 'quiz') {
        const requestedQuestionCount = input.questionCount === undefined ? 10 : Number(input.questionCount);
        if (!Number.isInteger(requestedQuestionCount) || requestedQuestionCount < 1 || requestedQuestionCount > 30) {
          throw new Error('questionCount must be an integer between 1 and 30.');
        }

        const generationInput = {
          task,
          subject,
          grade,
          topic,
          quizType,
          difficulty,
          questionCount: requestedQuestionCount,
          standards,
          objectives,
          learnerProfile,
          routingSessionId: `education-assessment:${draft.id}`,
        };
        const validateGeneratedQuiz = (content) => {
          const issues = [];
          if (!content || typeof content !== 'object') return ['generator did not return a JSON object'];
          const questions = content.questions;
          const answerKey = content.answerKey;
          if (!Array.isArray(questions) || questions.length !== requestedQuestionCount) {
            issues.push(`questions must contain exactly ${requestedQuestionCount} items`);
          }
          if (!Array.isArray(answerKey) || answerKey.length !== requestedQuestionCount) {
            issues.push(`answerKey must contain exactly ${requestedQuestionCount} entries`);
          }
          const hasPlaceholder = (value) => {
            if (typeof value === 'string') {
              return /(?:\.\.\.|\[[^\]]+\]|\b(?:placeholder|todo|tbd)\b|\bavailable in (?:the )?teacher (?:version|key)\b|\bsee (?:the )?teacher(?:'s)? (?:version|key)\b|\bprovided separately\b)/i.test(value);
            }
            if (Array.isArray(value)) return value.some(hasPlaceholder);
            if (value && typeof value === 'object') return Object.values(value).some(hasPlaceholder);
            return false;
          };
          const parseFraction = (value) => {
            const raw = String(value).trim();
            const normalize = (top, bottom) => {
              if (bottom === 0n) return null;
              if (bottom < 0n) {
                top = -top;
                bottom = -bottom;
              }
              let left = top < 0n ? -top : top;
              let right = bottom;
              while (right !== 0n) {
                const remainder = left % right;
                left = right;
                right = remainder;
              }
              const divisor = left || 1n;
              return { numerator: top / divisor, denominator: bottom / divisor };
            };
            const mixed = raw.match(/^(-?\d+)\s+(\d+)\s*\/\s*(\d+)$/);
            if (mixed) {
              const whole = BigInt(mixed[1]);
              const part = BigInt(mixed[2]);
              const denominator = BigInt(mixed[3]);
              const sign = whole < 0n ? -1n : 1n;
              const numerator = (whole < 0n ? -whole : whole) * denominator + part;
              return normalize(sign * numerator, denominator);
            }
            const match = raw.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
            if (!match) return null;
            const parseDecimal = (part) => {
              const negative = part.startsWith('-');
              const unsigned = negative ? part.slice(1) : part;
              const pieces = unsigned.split('.');
              const scale = 10n ** BigInt((pieces[1] || '').length);
              const numerator = BigInt(pieces[0]) * scale + BigInt(pieces[1] || '0');
              return { numerator: negative ? -numerator : numerator, denominator: scale };
            };
            const numerator = parseDecimal(match[1]);
            const denominator = parseDecimal(match[2]);
            return normalize(
              numerator.numerator * denominator.denominator,
              numerator.denominator * denominator.numerator,
            );
          };
          const fractionTokens = (value) => {
            const matches = String(value || '').match(/-?\d+\s+\d+\s*\/\s*\d+|-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?/g) || [];
            return matches.map((text) => ({ text: text.replace(/\s+/g, ' ').trim(), value: parseFraction(text) }))
              .filter((match) => match.value);
          };
          const parseChoiceValue = (value) => {
            const text = String(value || '').trim();
            const direct = parseFraction(text)
              || (/^-?\d+(?:\.\d+)?$/.test(text) ? parseFraction(text + '/1') : null);
            if (direct) return direct;
            const tokens = fractionTokens(text);
            return tokens.length === 1 ? tokens[0].value : null;
          };
          const fractionsEqual = (left, right) => (
            left.numerator * right.denominator === right.numerator * left.denominator
          );
          const compareFractions = (left, right) => {
            const difference = left.numerator * right.denominator - right.numerator * left.denominator;
            return difference < 0n ? -1 : difference > 0n ? 1 : 0;
          };
          const subtractFractions = (left, right) => parseFraction(
            String(left.numerator * right.denominator - right.numerator * left.denominator)
              + '/' + String(left.denominator * right.denominator),
          );
          const multiplyFractions = (left, right) => parseFraction(
            String(left.numerator * right.numerator) + '/' + String(left.denominator * right.denominator),
          );
          const divideFractions = (left, right) => right.numerator === 0n
            ? null
            : parseFraction(
              String(left.numerator * right.denominator) + '/' + String(left.denominator * right.numerator),
            );
          const evaluateMultiplyDivide = (expression) => {
            const normalized = expression.replace(/\s+/g, '');
            const tokens = normalized.match(/\d+|[*/]/g) || [];
            if (tokens.join('') !== normalized || tokens.length === 0 || tokens.length % 2 === 0) return null;
            let value = parseFraction(tokens[0] + '/1');
            for (let index = 1; index < tokens.length; index += 2) {
              const right = parseFraction(tokens[index + 1] + '/1');
              value = tokens[index] === '*'
                ? multiplyFractions(value, right)
                : divideFractions(value, right);
              if (!value) return null;
            }
            return value;
          };
          const mathContext = /math|fraction/i.test(subject + ' ' + topic);
          const verifyUniqueChoice = (choices, index, number, description, predicate) => {
            const correctChoices = choices.filter((choice) => {
              const value = parseChoiceValue(choice?.text);
              return value !== null && predicate(value);
            });
            if (correctChoices.length !== 1) {
              issues.push(`Question ${number} must have exactly one choice ${description}; found ${correctChoices.length}`);
            } else if (answerKey?.[index]?.answer !== correctChoices[0]?.label) {
              issues.push(`Question ${number} answer key must select the choice ${description}`);
            }
          };
          if (Array.isArray(questions)) {
            questions.forEach((question, index) => {
              const number = index + 1;
              if (!question || question.number !== number) issues.push(`questions[${index}].number must be ${number}`);
              if (!['multiple-choice', 'short-answer'].includes(question?.type)) {
                issues.push(`questions[${index}].type must be multiple-choice or short-answer`);
              }
              if (typeof question?.stem !== 'string' || !question.stem.trim()) issues.push(`questions[${index}].stem must be non-empty`);
              if (!Number.isFinite(question?.points) || question.points < 1) issues.push(`questions[${index}].points must be a positive number`);
              if (question && hasPlaceholder(question)) issues.push(`questions[${index}] contains placeholder text`);
              if (quizType === 'multiple-choice' && question?.type !== 'multiple-choice') {
                issues.push(`questions[${index}].type must be multiple-choice`);
              }
              if (question?.type === 'multiple-choice') {
                const choices = question?.choices;
                const labels = Array.isArray(choices) ? choices.map((choice) => choice?.label) : [];
                const choiceTexts = Array.isArray(choices) ? choices.map((choice) => choice?.text) : [];
                if (!Array.isArray(choices) || choices.length !== 4 || labels.join(',') !== 'A,B,C,D') {
                  issues.push(`questions[${index}] must have four choices labelled A, B, C, and D`);
                }
                const normalizedChoiceTexts = choiceTexts.map((text) => typeof text === 'string' ? text.trim().toLowerCase() : '');
                if (
                  choiceTexts.some((text) => typeof text !== 'string' || !text.trim())
                  || new Set(normalizedChoiceTexts).size !== 4
                ) {
                  issues.push(`questions[${index}] choices must be four distinct, non-empty options`);
                }
                if (mathContext && Array.isArray(choices) && typeof question?.stem === 'string') {
                  const inverseAddition = question.stem.match(
                    /equal to\s+(-?\d+\s*\/\s*\d+)\s+when added to\s+(-?\d+\s*\/\s*\d+)/i,
                  );
                  if (inverseAddition) {
                    const target = parseFraction(inverseAddition[1]);
                    const addend = parseFraction(inverseAddition[2]);
                    const expected = target && addend ? subtractFractions(target, addend) : null;
                    if (expected) {
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `satisfying ${inverseAddition[2]} + x = ${inverseAddition[1]}`,
                        (value) => fractionsEqual(value, expected),
                      );
                    }
                  } else if (!/added to/i.test(question.stem)) {
                    const equivalentTo = question.stem.match(
                      /(?:equivalent to|equal to)\s+(-?\d+\s*\/\s*\d+)/i,
                    );
                    const expected = equivalentTo ? parseFraction(equivalentTo[1]) : null;
                    if (expected) {
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `equivalent to ${equivalentTo[1]}`,
                        (value) => fractionsEqual(value, expected),
                      );
                    }
                  }

                  const inequality = question.stem.match(
                    /\b(greater|larger|more|less|smaller)\s+than\s+(-?\d+\s*\/\s*\d+)/i,
                  );
                  if (inequality) {
                    const threshold = parseFraction(inequality[2]);
                    if (threshold) {
                      const wantsGreater = /^(greater|larger|more)$/i.test(inequality[1]);
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `${wantsGreater ? 'greater' : 'less'} than ${inequality[2]}`,
                        (value) => wantsGreater
                          ? compareFractions(value, threshold) > 0
                          : compareFractions(value, threshold) < 0,
                      );
                    }
                  }

                  const product = question.stem.match(
                    /(-?\d+\s*\/\s*\d+)\s*(?:of|times|by|[×x*])\s*(-?\d+\s*\/\s*\d+)/i,
                  ) || question.stem.match(
                    /(?:product of|multiply)\s+(-?\d+\s*\/\s*\d+)\s+(?:and|by)\s+(-?\d+\s*\/\s*\d+)/i,
                  );
                  if (product) {
                    const left = parseFraction(product[1]);
                    const right = parseFraction(product[2]);
                    const expected = left && right ? multiplyFractions(left, right) : null;
                    if (expected) {
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `equal to ${product[1]} of ${product[2]}`,
                        (value) => fractionsEqual(value, expected),
                      );
                    }
                  }

                  const groupQuantity = question.stem.match(
                    /(-?\d+\s*\/\s*\d+)\s+of\s+(?:(?:a|the)\s+)?(?:group|whole|number|quantity|it|them)\s+(?:is(?:\s+equal to)?|equals?)\s+(-?\d+(?:\.\d+)?)/i,
                  );
                  const asksForWhole = /\b(?:how many (?:groups|items|parts|people|objects)|what (?:is|was) the (?:whole|total|original number|number|quantity)|find|determine|calculate)\b|\bhow many\b.*\btotal\b/i
                    .test(question.stem);
                  const verifiedGroupQuantity = groupQuantity && asksForWhole;
                  if (verifiedGroupQuantity) {
                    const fraction = parseFraction(groupQuantity[1]);
                    const amount = parseFraction(groupQuantity[2] + '/1');
                    const expected = fraction && amount ? divideFractions(amount, fraction) : null;
                    if (expected) {
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `equal to the total implied by ${groupQuantity[1]} of a group being ${groupQuantity[2]}`,
                        (value) => fractionsEqual(value, expected),
                      );
                    }
                  }

                  const pairComparison = fractionTokens(question.stem);
                  if (/compare/i.test(question.stem) && pairComparison.length >= 2) {
                    const comparison = compareFractions(pairComparison[0].value, pairComparison[1].value);
                    if (comparison !== 0) {
                      const larger = comparison > 0 ? pairComparison[0] : pairComparison[1];
                      verifyUniqueChoice(
                        choices,
                        index,
                        number,
                        `equal to the larger fraction ${larger.text}`,
                        (value) => fractionsEqual(value, larger.value),
                      );
                    }
                  }

                  const supportedPattern = /(?:equivalent to|equal to|added to|greater than|larger than|more than|less than|smaller than|compare|of\b|how many groups?|\bproduct\b|\bmultiply\b|\btimes\b|[×*])/i.test(question.stem);
                  const hasPairComparison = /compare/i.test(question.stem) && pairComparison.length >= 2;
                  if (fractionTokens(question.stem).length > 0 && supportedPattern
                    && !inverseAddition && !inequality && !product && !verifiedGroupQuantity
                    && !hasPairComparison
                    && !question.stem.match(/(?:equivalent to|equal to)\s+(-?\d+\s*\/\s*\d+)/i)) {
                    issues.push(`Question ${number} uses a fraction operation this Skill cannot verify automatically`);
                  }
                }
              }
            });
            if (quizType === 'mixed' && questions.length > 1 && new Set(questions.map((question) => question?.type)).size < 2) {
              issues.push('mixed quizzes must include at least two question types');
            }
          }
          if (Array.isArray(answerKey)) {
            answerKey.forEach((entry, index) => {
              const number = index + 1;
              if (!entry || entry.number !== number) issues.push(`answerKey[${index}].number must be ${number}`);
              if (typeof entry?.answer !== 'string' || !entry.answer.trim()) issues.push(`answerKey[${index}].answer must be non-empty`);
              if (typeof entry?.rationale !== 'string' || !entry.rationale.trim()) issues.push(`answerKey[${index}].rationale must be non-empty`);
              if (entry && hasPlaceholder(entry)) issues.push(`answerKey[${index}] contains placeholder text`);
              if (questions?.[index]?.type === 'multiple-choice') {
                const choices = questions[index]?.choices;
                const labels = Array.isArray(choices) ? choices.map((choice) => choice?.label) : [];
                if (!labels.includes(entry?.answer)) issues.push(`answerKey[${index}].answer must identify one of its question's choices`);
              }
            });
          }
          if (mathContext && Array.isArray(questions) && Array.isArray(answerKey)) {
            questions.forEach((question, index) => {
              const number = index + 1;
              const stem = typeof question?.stem === 'string' ? question.stem : '';
              const answer = typeof answerKey[index]?.answer === 'string' ? answerKey[index].answer : '';
              const rationale = typeof answerKey[index]?.rationale === 'string' ? answerKey[index].rationale : '';
              const selectedChoice = question?.type === 'multiple-choice' && Array.isArray(question.choices)
                ? question.choices.find((choice) => choice?.label === answer)
                : null;
              const answerText = typeof selectedChoice?.text === 'string' ? selectedChoice.text : answer;
              const additionPrompt = stem.match(
                /addition of\s+(-?\d+\s*\/\s*\d+)\s+and\s+(-?\d+\s*\/\s*\d+)/i,
              );
              if (additionPrompt) {
                const left = parseFraction(additionPrompt[1]);
                const right = parseFraction(additionPrompt[2]);
                const answerFractions = fractionTokens(answerText);
                const hasLeft = left && answerFractions.some((token) => fractionsEqual(token.value, left));
                const hasRight = right && answerFractions.some((token) => fractionsEqual(token.value, right));
                if (!left || !right || !answerText.includes('+') || !hasLeft || !hasRight) {
                  issues.push(`Question ${number} answer key must represent the requested fraction addition`);
                }
              }

              const comparisonValues = fractionTokens(stem);
              if (/\b(?:compare|larger|greater|smaller)\b/i.test(stem) && comparisonValues.length >= 2) {
                const left = comparisonValues[0].value;
                const right = comparisonValues[1].value;
                const comparison = compareFractions(left, right);
                if (comparison !== 0) {
                  const larger = comparison > 0 ? comparisonValues[0] : comparisonValues[1];
                  if (!fractionTokens(answerText).some((token) => fractionsEqual(token.value, larger.value))) {
                    issues.push(`Question ${number} answer key must identify ${larger.text} as the larger fraction`);
                  }
                }
                if (/parts per hundred/i.test(stem)) {
                  const difference = subtractFractions(left, right);
                  const expected = Math.abs(Number(difference.numerator) / Number(difference.denominator)) * 100;
                  const reported = answerText.match(
                    /\bby\s+(\d+(?:\.\d+)?)(?:\s+(\d+)\s*\/\s*(\d+))?\s+parts? per hundred/i,
                  );
                  const actual = reported
                    ? Number(reported[1]) + (reported[2] ? Number(reported[2]) / Number(reported[3]) : 0)
                    : Number.NaN;
                  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > 0.02) {
                    issues.push(`Question ${number} answer key must give the correct difference in parts per hundred`);
                  }
                }
              }

              const rationalEquality = /(-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?)\s*,?\s+(?:(?:(?:which\s+)?is\s+(?:(?:already|exactly)\s+)?(?:(?:equal to|equivalent to)\s+)?)|(?:becomes?|equals?)\s+)(-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?)/gi;
              for (const text of [answerText, rationale]) {
                let match;
                while ((match = rationalEquality.exec(text)) !== null) {
                  const left = parseFraction(match[1]);
                  const right = parseFraction(match[2]);
                  if (!left || !right || !fractionsEqual(left, right)) {
                    issues.push(`Question ${number} answer key contains a false fraction equivalence: ${match[1]} and ${match[2]}`);
                  }
                }
                rationalEquality.lastIndex = 0;
              }

              const arithmeticEquality = /(-?\d+\s*\/\s*\d+)\s*([+-])\s*(-?\d+\s*\/\s*\d+)\s*=\s*(-?\d+\s*\/\s*\d+)/g;
              let equation;
              while ((equation = arithmeticEquality.exec(rationale)) !== null) {
                const left = parseFraction(equation[1]);
                const right = parseFraction(equation[3]);
                const result = parseFraction(equation[4]);
                if (!left || !right || !result) {
                  issues.push(`Question ${number} answer key contains an invalid fraction calculation: ${equation[0]}`);
                  continue;
                }
                const expected = equation[2] === '+'
                  ? parseFraction(String(left.numerator * right.denominator + right.numerator * left.denominator)
                    + '/' + String(left.denominator * right.denominator))
                  : subtractFractions(left, right);
                if (!fractionsEqual(expected, result)) {
                  issues.push(`Question ${number} answer key contains an incorrect fraction calculation: ${equation[0]}`);
                }
              }
              const multiplyDivideEquality = /([0-9*/\s]+)\s*=\s*(-?\d+\s*\/\s*\d+)/g;
              let operation;
              while ((operation = multiplyDivideEquality.exec(rationale)) !== null) {
                const expressionStart = operation.index + operation[0].indexOf(operation[1]);
                const precedingText = rationale.slice(0, expressionStart).trimEnd();
                if (/[0-9/*+.-]$/.test(precedingText)) continue;
                const evaluated = evaluateMultiplyDivide(operation[1]);
                const claimed = parseFraction(operation[2]);
                if (evaluated && claimed && !fractionsEqual(evaluated, claimed)) {
                  issues.push(`Question ${number} answer key contains an incorrect fraction calculation: ${operation[0]}`);
                }
              }
            });
          }
          return issues;
        };
        const normalizeGeneratedQuiz = (content) => {
          if (content && typeof content === 'object' && Array.isArray(content.questions)) {
            content.questions.forEach((question) => {
              if (
                question
                && typeof question === 'object'
                && (question.points === undefined || question.points === null)
              ) {
                question.points = 1;
              }
            });
          }
          return content;
        };

        let generatedQuiz;
        let validationIssues = [];
        let previousResponse = '';
        for (let attempt = 0; attempt < 2; attempt++) {
          const completion = await ctx.delegate('education-assessment-content-generator', {
            ...generationInput,
            ...(attempt > 0 ? { validationIssues, previousResponse } : {}),
          });
          if (completion?.success !== true) {
            throw new Error(`Assessment content generation failed: ${completion?.error || completion?.status || 'no successful response'}`);
          }
          generatedQuiz = normalizeGeneratedQuiz(
            completion.data && typeof completion.data === 'object' ? completion.data : completion,
          );
          validationIssues = validateGeneratedQuiz(generatedQuiz);
          const sourceRequestId = [
            completion?._requestId,
            completion?.requestId,
            completion?.data?._requestId,
            completion?.data?.requestId,
          ].find((value) => typeof value === 'string');
          const structuralIssues = validationIssues;
          const review = await ctx.delegate('education-assessment-content-reviewer', {
            subject,
            grade,
            topic,
            quizType,
            questionCount: requestedQuestionCount,
            assessment: generatedQuiz,
            validationIssues: structuralIssues,
            ...(sourceRequestId ? { sourceRequestId } : {}),
            routingSessionId: generationInput.routingSessionId,
          });
          if (review?.success !== true) {
            throw new Error(`Independent assessment review failed: ${review?.error || review?.status || 'no successful response'}`);
          }
          const reviewData = review.data && typeof review.data === 'object' ? review.data : review;
          if (
            typeof reviewData.valid !== 'boolean'
            || !Array.isArray(reviewData.issues)
            || !reviewData.issues.every((issue) => typeof issue === 'string')
          ) {
            throw new Error('Independent assessment review returned an invalid result; the draft was not stored.');
          }
          validationIssues = Array.from(new Set([
            ...structuralIssues,
            ...reviewData.issues,
          ]));
          if (reviewData.valid && validationIssues.length === 0) break;
          if (validationIssues.length === 0) {
            validationIssues = ['The independent reviewer marked the assessment invalid without identifying an issue.'];
          }
          previousResponse = JSON.stringify(generatedQuiz);
        }
        if (validationIssues.length > 0) {
          throw new Error(`Assessment content generator returned an invalid quiz after repair: ${validationIssues.join('; ')}`);
        }

        draft.quiz = {
          title: `${subject} Quiz: ${topic}`,
          grade,
          subject,
          questionCount: requestedQuestionCount,
          type: quizType,
          difficulty,
          questions: generatedQuiz.questions,
          answerKey: generatedQuiz.answerKey,
          timeLimit: `${Math.ceil(requestedQuestionCount * 1.5)} minutes`,
        };
      } else if (task === 'activity') {
        const activityTemplates = {
          discussion: { name: 'Socratic Seminar', steps: ['Pose open-ended question', 'Small group prep', 'Whole class dialogue', 'Reflection writing'], grouping: 'whole-class then small groups' },
          'group-work': { name: 'Jigsaw Activity', steps: ['Expert groups form', 'Research assigned subtopic', 'Teach home group', 'Synthesize'], grouping: 'expert groups → home groups' },
          lab: { name: 'Inquiry Lab', steps: ['Observe phenomenon', 'Form hypothesis', 'Design experiment', 'Collect data', 'Draw conclusions'], grouping: 'lab partners' },
          'project-based': { name: 'Mini-PBL', steps: ['Define driving question', 'Plan inquiry', 'Create product', 'Present findings', 'Reflect'], grouping: 'project teams' },
          game: { name: 'Review Game', steps: ['Form teams', 'Answer questions', 'Earn points', 'Debrief misconceptions'], grouping: 'competitive teams' },
          simulation: { name: 'Role-Play Simulation', steps: ['Assign roles', 'Brief scenario', 'Act out', 'Debrief decisions'], grouping: 'role-based groups' },
          writing: { name: 'Structured Writing', steps: ['Brainstorm', 'Outline', 'Draft', 'Peer review', 'Revise'], grouping: 'individual then pairs' },
          'digital-creation': { name: 'Multimedia Project', steps: ['Plan storyboard', 'Gather assets', 'Create in tool', 'Peer feedback', 'Publish/share'], grouping: 'individual or pairs' },
        };

        const template = activityTemplates[activityType] || activityTemplates.discussion;

        draft.activity = {
          title: `${activityType.charAt(0).toUpperCase() + activityType.slice(1)}: ${topic}`,
          type: activityType,
          subject,
          grade,
          duration: `${Math.floor(duration * 0.6)}-${Math.floor(duration * 0.8)} minutes`,
          objectives: objectives.length ? objectives : [`Engage with ${topic}`, 'Collaborate with peers', 'Demonstrate understanding'],
          materials: ['Activity handout', 'Timer', ...(multimedia.length ? multimedia : ['Whiteboard'])],
          steps: template.steps.map((step, i) => (`${i + 1}. ${step}`)),
          grouping: template.grouping,
          differentiation: {
            support: ['Graphic organizer', 'Sentence starters', 'Reduced complexity', 'Teacher check-ins'],
            extension: ['Add research component', 'Create extension product', 'Teach a peer', 'Connect to real world'],
          },
          assessment: 'Observation checklist + exit slip',
        };
      } else if (task === 'content') {
        draft.content = {
          title: `${subject} Resource: ${topic}`,
          type: 'instructional-material',
          format: input.contentFormat || 'handout',
          grade,
          subject,
          sections: [
            'Key Vocabulary (5-7 terms with definitions)',
            'Concept Explanation (clear, grade-appropriate language)',
            'Worked Examples (2-3 with step-by-step)',
            'Practice Problems (5-8, scaffolded difficulty)',
            'Real-World Connection',
            'Self-Check / Answer Key',
          ],
          readability: `Grade ${grade} appropriate (Lexile estimate: ${grade * 100 + 200}L)`,
          standards,
        };
      } else if (task === 'multimedia') {
        const mediaPlan = [];
        if (multimedia.includes('video')) mediaPlan.push({ type: 'video', purpose: 'Concept introduction or demonstration', duration: '3-5 min', source: 'Curated or teacher-created' });
        if (multimedia.includes('simulation')) mediaPlan.push({ type: 'simulation', purpose: 'Interactive exploration', tool: 'PhET, Gizmos, or custom', integration: 'Embedded in LMS' });
        if (multimedia.includes('audio')) mediaPlan.push({ type: 'audio', purpose: 'Podcast/reading for accessibility', duration: '5-10 min', use: 'Differentiated instruction' });
        if (multimedia.includes('interactive')) mediaPlan.push({ type: 'interactive', purpose: 'Formative practice', tool: 'Nearpod, Pear Deck, Kahoot', timing: 'During guided practice' });
        if (multimedia.includes('vr-ar')) mediaPlan.push({ type: 'vr-ar', purpose: 'Immersive experience', tool: 'Google Expeditions, CoSpaces', note: 'Requires hardware access' });

        draft.multimediaPlan = {
          topic,
          subject,
          grade,
          media: mediaPlan.length ? mediaPlan : [{ type: 'video', purpose: 'Concept demo', duration: '3-5 min' }],
          integrationPoints: ['Warm-up hook', 'Direct instruction supplement', 'Station rotation', 'Homework flip'],
          accessibility: ['Closed captions', 'Transcripts', 'Audio descriptions', 'Keyboard navigation'],
        };
      } else {
        // A bare `return` here produced no output envelope at all, so an
        // unrecognised task surfaced as a bare {status, error} with no draft and
        // no explanation. Fail explicitly instead.
        return {
          success: false,
          status: 'error',
          data: null,
          error: `Unsupported task: ${task}. Expected one of lesson-plan, quiz, activity, content, multimedia.`,
          present: [
            ctx.render.text('notice', 'Unsupported task', `Cannot draft "${task}". Expected one of: lesson-plan, quiz, activity, content, multimedia.`),
          ],
        };
      }

      store.push(draft);
      ctx.store.save('drafts', store);
      return {
        success: true,
        data: { draft },
        // Without a rendered block the Overview panel shows a finished run with
        // an empty result area.
        present: [
          ctx.render.text('report', 'Drafted ' + task, [
            'Task: ' + task,
            'Subject: ' + (subject || '(unspecified)'),
            'Grade: ' + (grade || '(unspecified)'),
            'Topic: ' + (topic || '(unspecified)'),
            '',
            'Draft stored at: ' + ctx.store.getFilePath('drafts'),
            'This draft requires teacher review before use.',
          ]),
        ],
      };
    }
  });
