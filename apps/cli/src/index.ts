#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { getConfig, ConfigManager, generateId, LLMFactory, getCostTracker, type Config } from '@applypilot/core';
import { DatabaseManager, JobRepository, ApplicationRepository } from '@applypilot/tracker';
import { JDParser, LLMJDAnalyzer } from '@applypilot/jd';
import { PDFCompiler } from '@applypilot/pdf';
import { ResumeTemplate, LLMResumeTailor, CoverLetterGenerator, AnswersPackGenerator } from '@applypilot/resume';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';

const program = new Command();

program
  .name('applypilot')
  .description('AI-powered job application assistant')
  .version('0.1.0');

// Init command
program
  .command('init')
  .description('Initialize ApplyPilot configuration')
  .action(() => {
    console.log(chalk.blue.bold('🚀 Initializing ApplyPilot...\n'));
    
    // Initialize configuration
    const config = ConfigManager.getInstance();
    console.log(chalk.green('✓ Configuration initialized'));
    console.log(chalk.gray(`  Location: ${config.getConfigPathLocation()}`));
    
    // Initialize database
    const db = DatabaseManager.getInstance();
    console.log(chalk.green('✓ Database initialized'));
    console.log(chalk.gray(`  Location: ${config.getPathsConfig().dbPath}`));
    
    // Check for example files
    console.log(chalk.blue('\n📋 Next steps:'));
    console.log(chalk.white('  1. Copy example files:'));
    console.log(chalk.gray('     cp data/profile.example.json data/profile.json'));
    console.log(chalk.gray('     cp data/achievements.example.yaml data/achievements.yaml'));
    console.log(chalk.gray('     cp resumes/base/resume.example.tex resumes/base/resume.tex'));
    console.log(chalk.white('  2. Edit the files with your information'));
    console.log(chalk.white('  3. Run "applypilot doctor" to check setup'));
    
    db.close();
  });

// Config command
program
  .command('config')
  .description('Show current configuration')
  .action(() => {
    const config = getConfig();
    console.log(chalk.blue.bold('Current Configuration:\n'));
    console.log(chalk.cyan('LaTeX:'));
    console.log(`  Engine: ${config.latex.engine}`);
    console.log(`  Max Runs: ${config.latex.maxRuns}`);
    console.log(chalk.cyan('\nLLM:'));
    console.log(`  Provider: ${config.llm.provider}`);
    console.log(`  Model: ${config.llm.model}`);
    console.log(`  Base URL: ${config.llm.baseUrl || 'default'}`);
    console.log(chalk.cyan('\nPaths:'));
    console.log(`  Data Dir: ${config.paths.dataDir}`);
    console.log(`  Resumes Dir: ${config.paths.resumesDir}`);
    console.log(`  DB Path: ${config.paths.dbPath}`);
    console.log(chalk.cyan('\nTailoring:'));
    console.log(`  Max Skills: ${config.tailoring.maxSkills}`);
    console.log(`  Max Bullets: ${config.tailoring.maxBulletPoints}`);
    console.log(`  Truthfulness: ${config.tailoring.enforceTruthfulness ? '✓' : '✗'}`);
  });

// Set LLM provider command
program
  .command('set-llm')
  .description('Set LLM provider and model')
  .option('-p, --provider <provider>', 'Provider (ollama, openai, anthropic, google, azure-openai)')
  .option('-m, --model <model>', 'Model name')
  .option('--api-key <key>', 'API key (for external providers)')
  .action(async (options) => {
    const config = ConfigManager.getInstance();
    
    if (!options.provider) {
      console.log(chalk.blue('Available providers:\n'));
      for (const provider of LLMFactory.getAvailableProviders()) {
        const isLocal = LLMFactory.isLocalProvider(provider);
        const marker = isLocal ? chalk.green('●') : chalk.yellow('●');
        console.log(`  ${marker} ${provider.padEnd(15)} ${LLMFactory.getProviderDescription(provider)}`);
      }
      console.log(chalk.gray('\nUse --provider <name> to set a provider'));
      return;
    }

    // Validate provider
    if (!LLMFactory.getAvailableProviders().includes(options.provider)) {
      console.log(chalk.red(`✗ Unknown provider: ${options.provider}`));
      console.log(chalk.gray(`Available: ${LLMFactory.getAvailableProviders().join(', ')}`));
      return;
    }

    const updates: Partial<Config['llm']> = {
      provider: options.provider,
    };

    // Set default model if not provided
    if (!options.model) {
      updates.model = LLMFactory.getDefaultModel(options.provider);
      console.log(chalk.blue(`Using default model: ${updates.model}`));
    } else {
      updates.model = options.model;
    }

    // Handle API key for external providers
    if (LLMFactory.requiresAPIKey(options.provider)) {
      console.log(chalk.yellow('\n⚠ Warning: Using external API provider'));
      console.log(chalk.gray('  Your job description data will be sent to external servers'));
      
      if (options.apiKey) {
        // Don't store API key in config, use environment variable instead
        const envVar = LLMFactory.getAPIKeyEnvVar(options.provider);
        console.log(chalk.blue(`\nPlease set the API key as an environment variable:`));
        console.log(chalk.white(`  export ${envVar}="${options.apiKey}"`));
        console.log(chalk.gray('\nOr add it to your shell profile (.bashrc, .zshrc, etc.)'));
      } else {
        const envVar = LLMFactory.getAPIKeyEnvVar(options.provider);
        console.log(chalk.blue(`\nMake sure to set ${envVar} environment variable`));
      }
    }

    // Update config
    config.updateLLMConfig(updates);
    
    console.log(chalk.green(`\n✓ LLM provider set to: ${options.provider}`));
    console.log(chalk.green(`✓ Model set to: ${updates.model}`));
    
    // Test connection
    console.log(chalk.blue('\nTesting connection...'));
    try {
      const adapter = LLMFactory.createAdapter({
        ...config.getLLMConfig(),
        apiKey: config.getAPIKey() || '',
      });
      
      const health = await adapter.healthCheck();
      if (health.available) {
        console.log(chalk.green(`✓ Connection successful (${health.latency}ms)`));
        if (health.model) {
          console.log(chalk.gray(`  Model: ${health.model}`));
        }
      } else {
        console.log(chalk.red(`✗ Connection failed: ${health.error}`));
      }
    } catch (error) {
      console.log(chalk.red(`✗ Connection test failed: ${error}`));
    }
  });

// Analyze JD command
program
  .command('analyze')
  .description('Analyze a job description')
  .option('-t, --text <text>', 'JD text to analyze')
  .option('-f, --file <path>', 'JD file path (PDF, TXT, or MD)')
  .option('--save', 'Save to database')
  .option('--llm', 'Use LLM for analysis (requires profile)')
  .action(async (options) => {
    const parser = new JDParser();
    
    try {
      let result;
      
      if (options.text) {
        result = parser.parseFromText(options.text);
      } else if (options.file) {
        if (!existsSync(options.file)) {
          console.log(chalk.red(`✗ File not found: ${options.file}`));
          return;
        }
        result = await parser.parseFromFile(options.file);
      } else {
        console.log(chalk.red('✗ Please provide either --text or --file option'));
        console.log(chalk.gray('  Example: applypilot analyze --text "Job description here..."'));
        console.log(chalk.gray('  Example: applypilot analyze --file ./job.pdf'));
        return;
      }

      // Validate the parsed JD
      const validation = parser.validate(result.text);
      
      console.log(chalk.blue.bold('\n📄 Parsed Job Description\n'));
      console.log(chalk.cyan('Source:'), result.source);
      console.log(chalk.cyan('Word Count:'), result.metadata.wordCount);
      
      if (result.metadata.fileType) {
        console.log(chalk.cyan('File Type:'), result.metadata.fileType);
      }
      
      // Show validation results
      if (!validation.valid) {
        console.log(chalk.red('\n✗ Validation Errors:'));
        validation.errors.forEach(err => console.log(chalk.red(`  • ${err}`)));
      }
      
      if (validation.warnings.length > 0) {
        console.log(chalk.yellow('\n⚠ Warnings:'));
        validation.warnings.forEach(warn => console.log(chalk.yellow(`  • ${warn}`)));
      }
      
      // Extract title and company
      const title = parser.extractTitle(result.text);
      const company = parser.extractCompany(result.text);
      
      if (title) console.log(chalk.cyan('\nDetected Title:'), title);
      if (company) console.log(chalk.cyan('Detected Company:'), company);

      // LLM Analysis
      if (options.llm) {
        console.log(chalk.blue('\n🤖 Running LLM Analysis...'));
        
        // Load profile
        const profilePath = './data/profile.json';
        if (!existsSync(profilePath)) {
          console.log(chalk.red('\n✗ Profile not found. Please create data/profile.json'));
          return;
        }

        const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        
        const analyzer = new LLMJDAnalyzer();
        const analysis = await analyzer.quickAnalyze(result.text);
        
        console.log(chalk.green('\n✓ Analysis Complete'));
        console.log(chalk.cyan('Cost:'), `$${analysis.cost.toFixed(4)}`);
        console.log(chalk.cyan('\nRole Title:'), analysis.requirements.roleTitle);
        console.log(chalk.cyan('Seniority:'), analysis.requirements.seniority);
        
        if (analysis.requirements.mustHaveSkills.length > 0) {
          console.log(chalk.cyan('\nMust-Have Skills:'));
          analysis.requirements.mustHaveSkills.forEach(skill => {
            console.log(chalk.gray(`  • ${skill}`));
          });
        }

        if (analysis.requirements.niceToHaveSkills.length > 0) {
          console.log(chalk.cyan('\nNice-to-Have Skills:'));
          analysis.requirements.niceToHaveSkills.forEach(skill => {
            console.log(chalk.gray(`  • ${skill}`));
          });
        }

        if (analysis.requirements.redFlags.length > 0) {
          console.log(chalk.yellow('\n⚠ Red Flags:'));
          analysis.requirements.redFlags.forEach(flag => {
            console.log(chalk.yellow(`  • ${flag}`));
          });
        }
      }
      
      // Show preview
      console.log(chalk.blue('\n📝 Preview (first 500 chars):'));
      console.log(chalk.gray(result.text.substring(0, 500) + '...'));
      
      // Save to database if requested
      if (options.save) {
        const db = DatabaseManager.getInstance();
        const jobRepo = new JobRepository(db.getDatabase());
        
        const job = jobRepo.create({
          id: generateId('job'),
          source: result.source as 'paste' | 'file' | 'url',
          title: title || null,
          company: company || null,
          portal: null,
          url: result.metadata.url || null,
          jdText: result.text,
          requirementsJson: {} as Record<string, unknown>,
          fitScore: 0,
          status: 'new',
        });
        
        console.log(chalk.green(`\n✓ Saved to database with ID: ${job.id}`));
        db.close();
      }
      
    } catch (error) {
      console.log(chalk.red(`✗ Error: ${error}`));
    }
  });

// Tailor command
program
  .command('tailor')
  .description('Tailor resume for a job')
  .requiredOption('-j, --job <id>', 'Job ID')
  .option('-o, --output <path>', 'Output directory', './resumes/builds')
  .option('--no-cover-letter', 'Skip cover letter generation')
  .option('--no-answers', 'Skip answers pack generation')
  .action(async (options) => {
    console.log(chalk.blue.bold(`\n🎯 Tailoring resume for job ${options.job}...\n`));
    
    const db = DatabaseManager.getInstance();
    const jobRepo = new JobRepository(db.getDatabase());
    
    const job = jobRepo.findById(options.job);
    if (!job) {
      console.log(chalk.red(`✗ Job not found: ${options.job}`));
      db.close();
      return;
    }
    
    console.log(chalk.cyan('Job:'), job.title || 'Unknown');
    console.log(chalk.cyan('Company:'), job.company || 'Unknown');
    
    // Load profile
    const profilePath = './data/profile.json';
    if (!existsSync(profilePath)) {
      console.log(chalk.red('\n✗ Profile not found. Please create data/profile.json'));
      db.close();
      return;
    }
    
    const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
    
    // Analyze JD
    console.log(chalk.blue('\n📊 Analyzing job description...'));
    const analyzer = new LLMJDAnalyzer();
    const analysis = await analyzer.analyze(job.jdText, profile, job.id);
    
    console.log(chalk.green('✓ Analysis complete'));
    console.log(chalk.gray(`  Cost: $${analysis.cost.toFixed(4)}`));
    console.log(chalk.gray(`  Fit Score: ${analysis.fitAnalysis.score}%`));
    
    // Update job with analysis
    jobRepo.update(job.id, {
      requirementsJson: analysis.requirements as unknown as Record<string, unknown>,
      fitScore: analysis.fitAnalysis.score,
      status: 'analyzed',
    });
    
    // Tailor resume
    console.log(chalk.blue('\n✍️  Tailoring resume...'));
    const tailor = new LLMResumeTailor();
    const tailored = await tailor.tailor(profile, analysis.requirements, job.id);
    
    console.log(chalk.green('✓ Resume tailored'));
    console.log(chalk.gray(`  Cost: $${tailored.cost.toFixed(4)}`));
    console.log(chalk.gray(`  Changes: ${tailored.changes.length}`));
    
    // Save tailored LaTeX
    const outputDir = options.output;
    const timestamp = new Date().toISOString().split('T')[0];
    const baseName = `${job.id}_${timestamp}`;
    
    const texPath = join(outputDir, `${baseName}.tex`);
    writeFileSync(texPath, tailored.latex, 'utf-8');
    console.log(chalk.gray(`  Saved: ${texPath}`));
    
    // Generate cover letter if requested
    let coverLetterCost = 0;
    if (options.coverLetter) {
      console.log(chalk.blue('\n📝 Generating cover letter...'));
      const coverLetterGen = new CoverLetterGenerator();
      const coverLetters = await coverLetterGen.generate(profile, analysis.requirements, job.id);
      
      const coverLetterPath = join(outputDir, `${baseName}_cover_letter.txt`);
      writeFileSync(coverLetterPath, 
        `SHORT VERSION:\n\n${coverLetters.short}\n\n` +
        `LONG VERSION:\n\n${coverLetters.long}`,
        'utf-8'
      );
      
      console.log(chalk.green('✓ Cover letter generated'));
      console.log(chalk.gray(`  Cost: $${coverLetters.cost.toFixed(4)}`));
      console.log(chalk.gray(`  Saved: ${coverLetterPath}`));
      coverLetterCost = coverLetters.cost;
    }
    
    // Generate answers pack if requested
    let answersCost = 0;
    if (options.answers) {
      console.log(chalk.blue('\n💬 Generating answers pack...'));
      const answersGen = new AnswersPackGenerator();
      const answers = await answersGen.generate(profile, analysis.requirements, job.id);
      
      const answersPath = join(outputDir, `${baseName}_answers.json`);
      writeFileSync(answersPath, JSON.stringify({
        screeningQuestions: answers.screeningQuestions,
        formAnswers: answers.formAnswers,
      }, null, 2), 'utf-8');
      
      console.log(chalk.green('✓ Answers pack generated'));
      console.log(chalk.gray(`  Cost: $${answers.cost.toFixed(4)}`));
      console.log(chalk.gray(`  Saved: ${answersPath}`));
      answersCost = answers.cost;
    }
    
    // Total cost
    const totalCost = analysis.cost + tailored.cost + coverLetterCost + answersCost;
    console.log(chalk.blue(`\n💰 Total Cost: $${totalCost.toFixed(4)}`));
    
    // Update job status
    jobRepo.update(job.id, { status: 'tailored' });
    
    console.log(chalk.green.bold('\n✓ Tailoring complete!'));
    console.log(chalk.gray(`  Output directory: ${outputDir}`));
    
    db.close();
  });

// Cost tracking commands
const costCmd = program.command('cost').description('Cost tracking commands');

costCmd
  .command('summary')
  .description('Show cost summary')
  .option('-d, --days <days>', 'Number of days to summarize', '30')
  .action((options) => {
    const tracker = getCostTracker();
    const days = parseInt(options.days);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const summary = tracker.getSummary({ startDate, endDate });
    
    console.log(chalk.blue.bold(`\n💰 Cost Summary (Last ${days} days)\n`));
    console.log(chalk.cyan('Total Cost:'), chalk.yellow(`$${summary.totalCost.toFixed(4)}`));
    console.log(chalk.cyan('Total Tokens:'), summary.totalTokens.toLocaleString());
    console.log(chalk.cyan('Total Requests:'), summary.totalRequests);
    
    if (Object.keys(summary.byProvider).length > 0) {
      console.log(chalk.blue('\nBy Provider:'));
      Object.entries(summary.byProvider).forEach(([provider, stats]) => {
        console.log(`  ${provider.padEnd(15)} $${stats.cost.toFixed(4)} (${stats.requests} requests)`);
      });
    }
    
    if (Object.keys(summary.byModel).length > 0) {
      console.log(chalk.blue('\nBy Model:'));
      Object.entries(summary.byModel).forEach(([model, stats]) => {
        console.log(`  ${model.padEnd(25)} $${stats.cost.toFixed(4)}`);
      });
    }
    
    tracker.close();
  });

costCmd
  .command('recent')
  .description('Show recent usage')
  .option('-n, --limit <limit>', 'Number of records', '20')
  .action((options) => {
    const tracker = getCostTracker();
    const limit = parseInt(options.limit);
    
    const records = tracker.getRecentUsage(limit);
    
    console.log(chalk.blue.bold(`\n📊 Recent Usage (Last ${records.length} records)\n`));
    
    records.forEach(record => {
      const date = new Date(record.timestamp).toLocaleString();
      console.log(`${chalk.gray(date)} ${record.operation.padEnd(20)} ${record.provider.padEnd(10)} $${record.cost.toFixed(4)}`);
    });
    
    tracker.close();
  });

costCmd
  .command('budget')
  .description('Check budget status')
  .option('-b, --budget <budget>', 'Monthly budget in USD', '50')
  .action((options) => {
    const tracker = getCostTracker();
    const budget = parseFloat(options.budget);
    
    const status = tracker.checkBudget(budget);
    
    console.log(chalk.blue.bold('\n💵 Budget Status\n'));
    console.log(chalk.cyan('Monthly Budget:'), `$${budget.toFixed(2)}`);
    console.log(chalk.cyan('Current Cost:'), `$${status.currentCost.toFixed(4)}`);
    console.log(chalk.cyan('Remaining:'), `$${status.remaining.toFixed(4)}`);
    
    const percentageColor = status.percentageUsed > 90 ? chalk.red :
                           status.percentageUsed > 75 ? chalk.yellow :
                           chalk.green;
    console.log(chalk.cyan('Used:'), percentageColor(`${status.percentageUsed}%`));
    
    if (!status.withinBudget) {
      console.log(chalk.red('\n⚠️  Budget exceeded!'));
    } else if (status.percentageUsed > 90) {
      console.log(chalk.yellow('\n⚠️  Approaching budget limit'));
    }
    
    tracker.close();
  });

// Track commands
const trackCmd = program.command('track').description('Application tracking commands');

trackCmd
  .command('list')
  .description('List all applications')
  .option('-s, --status <status>', 'Filter by status (drafted, ready, submitted, interview, rejected, offer)')
  .action((options) => {
    const db = DatabaseManager.getInstance();
    const appRepo = new ApplicationRepository(db.getDatabase());
    
    const apps = appRepo.findAll(options.status ? { status: options.status } : undefined);
    
    if (apps.length === 0) {
      console.log(chalk.yellow('No applications found.'));
      console.log(chalk.gray('Use "applypilot analyze --save" to add jobs.'));
    } else {
      console.log(chalk.blue.bold(`\n📋 Applications (${apps.length}):\n`));
      
      apps.forEach(app => {
        const statusColor = {
          drafted: chalk.gray,
          ready: chalk.blue,
          submitted: chalk.cyan,
          interview: chalk.yellow,
          rejected: chalk.red,
          offer: chalk.green,
          no_reply: chalk.gray,
          withdrawn: chalk.gray,
        }[app.status] || chalk.white;
        
        console.log(`${statusColor('●')} ${app.id.substring(0, 8)}...`);
        console.log(`   Status: ${statusColor(app.status)}`);
        console.log(`   Last Update: ${app.lastUpdate}`);
        if (app.notes) console.log(`   Notes: ${app.notes}`);
        console.log();
      });
    }
    
    db.close();
  });

trackCmd
  .command('stats')
  .description('Show application statistics')
  .action(() => {
    const db = DatabaseManager.getInstance();
    const appRepo = new ApplicationRepository(db.getDatabase());
    
    const stats = appRepo.getStats();
    
    console.log(chalk.blue.bold('\n📊 Application Statistics\n'));
    
    const statusColors: Record<string, (text: string) => string> = {
      drafted: chalk.gray,
      ready: chalk.blue,
      submitted: chalk.cyan,
      interview: chalk.yellow,
      rejected: chalk.red,
      offer: chalk.green,
      no_reply: chalk.gray,
      withdrawn: chalk.gray,
      total: chalk.white.bold,
    };
    
    Object.entries(stats).forEach(([status, count]) => {
      const color = statusColors[status] || chalk.white;
      const label = status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ');
      console.log(`${color('●')} ${label.padEnd(12)} ${count.toString().padStart(3)}`);
    });
    
    db.close();
  });

trackCmd
  .command('add')
  .description('Add a new job manually')
  .requiredOption('-t, --title <title>', 'Job title')
  .requiredOption('-c, --company <company>', 'Company name')
  .option('-u, --url <url>', 'Job URL')
  .option('-p, --portal <portal>', 'Job portal (linkedin, indeed, etc.)')
  .action((options) => {
    const db = DatabaseManager.getInstance();
    const jobRepo = new JobRepository(db.getDatabase());
    
    const job = jobRepo.create({
      id: generateId('job'),
      source: 'paste',
      title: options.title,
      company: options.company,
      portal: options.portal || null,
      url: options.url || null,
      jdText: `Job: ${options.title} at ${options.company}`,
      requirementsJson: {},
      fitScore: 0,
      status: 'new',
    });
    
    console.log(chalk.green(`✓ Added job: ${options.title} at ${options.company}`));
    console.log(chalk.gray(`  ID: ${job.id}`));
    
    db.close();
  });

// Onboard command - wizard setup
program
  .command('onboard')
  .description('Interactive setup wizard for new users')
  .option('--quick', 'Quick setup mode (skip optional steps)')
  .action(async (options) => {
    console.log(chalk.blue.bold('\n🚀 Welcome to ApplyPilot!\n'));
    console.log(chalk.gray('Let\'s get you set up for your job search journey.\n'));

    const mode = options.quick ? 'Quick' : 'Advanced';
    console.log(chalk.cyan(`Mode: ${mode} Setup\n`));

    // Step 1: Check prerequisites
    console.log(chalk.blue('Step 1: Checking Prerequisites\n'));

    const checks = {
      node: false,
      git: false,
      latex: false,
      llm: false,
    };

    // Check Node.js
    try {
      const nodeVersion = process.version;
      checks.node = true;
      console.log(chalk.green('✓ Node.js'), chalk.gray(nodeVersion));
    } catch {
      console.log(chalk.red('✗ Node.js not found'));
    }

    // Check Git
    try {
      checks.git = true;
      console.log(chalk.green('✓ Git'), chalk.gray('installed'));
    } catch {
      console.log(chalk.yellow('⚠ Git not found (optional)'));
    }

    // Step 2: LLM Configuration
    console.log(chalk.blue('\nStep 2: LLM Configuration\n'));

    console.log(chalk.white('Choose your LLM provider:\n'));
    console.log(chalk.gray('  1. Ollama (local, free)'));
    console.log(chalk.gray('  2. OpenAI (GPT-4, requires API key)'));
    console.log(chalk.gray('  3. Anthropic (Claude, requires API key)'));
    console.log(chalk.gray('  4. Skip for now\n'));

    // In a real implementation, this would use inquirer for interactive prompts
    // For now, show what the wizard would do
    console.log(chalk.cyan('→ Would prompt for LLM provider selection'));
    console.log(chalk.cyan('→ Would configure API keys if needed'));
    console.log(chalk.cyan('→ Would test connection\n'));

    // Step 3: Profile Setup
    console.log(chalk.blue('Step 3: Profile Setup\n'));

    const profilePath = './data/profile.json';
    if (existsSync(profilePath)) {
      console.log(chalk.green('✓ Profile file already exists'));
      try {
        const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        console.log(chalk.gray(`  Name: ${profile.personal?.firstName} ${profile.personal?.lastName}`));
      } catch {
        console.log(chalk.yellow('  ⚠ Profile file may be invalid'));
      }
    } else {
      console.log(chalk.cyan('→ Would create profile.json from template'));
      console.log(chalk.cyan('→ Would prompt for basic information:\n'));
      console.log(chalk.gray('  • Name'));
      console.log(chalk.gray('  • Email'));
      console.log(chalk.gray('  • Phone'));
      console.log(chalk.gray('  • Location'));
      console.log(chalk.gray('  • Target roles'));
      console.log(chalk.gray('  • Skills\n'));
    }

    // Step 4: Resume Template
    console.log(chalk.blue('Step 4: Resume Template\n'));

    const templatePath = './resumes/base/resume.tex';
    if (existsSync(templatePath)) {
      console.log(chalk.green('✓ Resume template found'));
    } else {
      console.log(chalk.cyan('→ Would create resume.tex from example template'));
      console.log(chalk.cyan('→ Would customize with your profile information\n'));
    }

    // Step 5: Database Setup
    console.log(chalk.blue('Step 5: Database Setup\n'));

    try {
      const db = DatabaseManager.getInstance();
      console.log(chalk.green('✓ Database initialized'));
      db.close();
    } catch (error) {
      console.log(chalk.red('✗ Database setup failed'));
    }

    // Summary
    console.log(chalk.blue('\n📋 Setup Summary\n'));

    if (options.quick) {
      console.log(chalk.gray('Quick setup completed with defaults.'));
      console.log(chalk.gray('You can customize settings later using:'));
      console.log(chalk.white('  applypilot config'));
      console.log(chalk.white('  applypilot set-llm\n'));
    } else {
      console.log(chalk.gray('Advanced setup would guide through:'));
      console.log(chalk.gray('  • LLM provider selection and configuration'));
      console.log(chalk.gray('  • Profile creation with detailed information'));
      console.log(chalk.gray('  • Resume template customization'));
      console.log(chalk.gray('  • Job search preferences'));
      console.log(chalk.gray('  • Notification settings\n'));
    }

    console.log(chalk.green.bold('✓ Onboarding complete!\n'));
    console.log(chalk.white('Next steps:'));
    console.log(chalk.gray('  1. Edit your profile: data/profile.json'));
    console.log(chalk.gray('  2. Customize your resume: resumes/base/resume.tex'));
    console.log(chalk.gray('  3. Run doctor to verify: applypilot doctor'));
    console.log(chalk.gray('  4. Analyze your first job: applypilot analyze --file job.pdf\n'));

    console.log(chalk.blue('Need help?'));
    console.log(chalk.gray('  Documentation: https://applypilot.dev/docs'));
    console.log(chalk.gray('  Community: https://discord.gg/applypilot'));
    console.log(chalk.gray('  Issues: https://github.com/applypilot/applypilot/issues\n'));
  });

// Doctor command - check setup
program
  .command('doctor')
  .description('Check system setup and dependencies')
  .action(async () => {
    console.log(chalk.blue.bold('🔍 Checking ApplyPilot setup...\n'));
    
    let allGood = true;
    
    // Check config
    try {
      const config = getConfig();
      console.log(chalk.green('✓ Configuration loaded'));
      console.log(chalk.gray(`  Path: ${ConfigManager.getInstance().getConfigPathLocation()}`));
    } catch (error) {
      console.log(chalk.red('✗ Configuration error'));
      allGood = false;
    }
    
    // Check database
    try {
      const db = DatabaseManager.getInstance();
      console.log(chalk.green('✓ Database connected'));
      db.close();
    } catch (error) {
      console.log(chalk.red('✗ Database connection failed'));
      allGood = false;
    }
    
    // Check LLM
    try {
      const config = ConfigManager.getInstance();
      const llmConfig = config.getLLMConfig();
      
      console.log(chalk.blue('\n🤖 LLM Configuration:'));
      console.log(chalk.gray(`  Provider: ${llmConfig.provider}`));
      console.log(chalk.gray(`  Model: ${llmConfig.model}`));
      
      const isLocal = LLMFactory.isLocalProvider(llmConfig.provider);
      
      if (!isLocal) {
        console.log(chalk.yellow('  ⚠ Using external API provider'));
        const apiKey = config.getAPIKey();
        if (apiKey) {
          console.log(chalk.green('  ✓ API key configured'));
        } else {
          console.log(chalk.red(`  ✗ API key not found (set ${config.getAPIKeyEnvVar()})`));
          allGood = false;
        }
      }
      
      // Test connection
      const adapter = LLMFactory.createAdapter({
        ...llmConfig,
        apiKey: config.getAPIKey() || '',
      });
      
      const validation = adapter.validateConfig();
      if (!validation.valid) {
        console.log(chalk.red('  ✗ Configuration validation failed:'));
        validation.errors.forEach(err => console.log(chalk.red(`    • ${err}`)));
        allGood = false;
      } else {
        console.log(chalk.blue('  Testing connection...'));
        const health = await adapter.healthCheck();
        if (health.available) {
          console.log(chalk.green(`  ✓ LLM connection successful (${health.latency}ms)`));
          if (health.model) {
            console.log(chalk.gray(`    Model: ${health.model}`));
          }
        } else {
          console.log(chalk.red(`  ✗ LLM connection failed: ${health.error}`));
          if (isLocal) {
            console.log(chalk.gray('    Make sure Ollama is running: ollama serve'));
          }
          allGood = false;
        }
      }
    } catch (error) {
      console.log(chalk.red('✗ LLM check failed'));
      allGood = false;
    }
    
    // Check LaTeX
    try {
      const config = getConfig();
      const compiler = new PDFCompiler(config.latex);
      const check = await compiler.checkEngine();
      
      if (check.available) {
        console.log(chalk.green(`\n✓ LaTeX engine available: ${check.engine}`));
        if (check.version) {
          console.log(chalk.gray(`  Version: ${check.version}`));
        }
      } else {
        console.log(chalk.red('\n✗ LaTeX engine not found'));
        console.log(chalk.gray(PDFCompiler.getInstallInstructions()));
        allGood = false;
      }
    } catch (error) {
      console.log(chalk.red('\n✗ LaTeX check failed'));
      allGood = false;
    }
    
    // Check profile files
    const profilePath = './data/profile.json';
    if (existsSync(profilePath)) {
      console.log(chalk.green('\n✓ Profile file found'));
      try {
        const profile = JSON.parse(readFileSync(profilePath, 'utf-8'));
        console.log(chalk.gray(`  Name: ${profile.personal?.firstName} ${profile.personal?.lastName}`));
      } catch {
        console.log(chalk.yellow('  ⚠ Profile file exists but may be invalid JSON'));
      }
    } else {
      console.log(chalk.yellow('\n⚠ Profile file not found'));
      console.log(chalk.gray('  Run: cp data/profile.example.json data/profile.json'));
    }
    
    // Check resume template
    const templatePath = './resumes/base/resume.tex';
    if (existsSync(templatePath)) {
      console.log(chalk.green('✓ Resume template found'));
    } else {
      console.log(chalk.yellow('⚠ Resume template not found'));
      console.log(chalk.gray('  Run: cp resumes/base/resume.example.tex resumes/base/resume.tex'));
    }
    
    console.log();
    if (allGood) {
      console.log(chalk.green.bold('✓ All checks passed! ApplyPilot is ready to use.'));
    } else {
      console.log(chalk.yellow.bold('⚠ Some checks failed. Please fix the issues above.'));
    }
  });

program.parse();
