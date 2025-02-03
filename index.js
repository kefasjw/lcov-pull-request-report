import { DefaultArtifactClient } from '@actions/artifact';
import core from '@actions/core';
import exec from '@actions/exec';
import github from '@actions/github';
import glob from '@actions/glob';
import lcovParse from 'lcov-parse';
import { markdownTable } from 'markdown-table';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

async function run() {
    try {
        const lcovFile = path.resolve(core.getInput('lcov-file'));
        const commentTitle = core.getInput('comment-title');
        const workingDirectory = path.resolve(core.getInput('working-directory'));
        const allFilesMinimumCoverage = parseFloat(core.getInput('all-files-minimum-coverage')) || 0;
        const changedFilesMinimumCoverage = parseFloat(core.getInput('changed-files-minimum-coverage')) || 0;
        const artifactName = core.getInput('artifact-name');
        const githubToken = core.getInput('github-token');
        const octokit = github.getOctokit(githubToken);

        console.log(`lcovFile: ${lcovFile}`);
        console.log(`commentTitle: ${commentTitle}`);
        console.log(`workingDirectory: ${workingDirectory}`);
        console.log(`allFilesMinimumCoverage: ${allFilesMinimumCoverage}`);
        console.log(`changedFilesMinimumCoverage: ${changedFilesMinimumCoverage}`);
        console.log(`artifactName: ${artifactName}`);
        console.log(`githubToken: ${githubToken}`);

        const data = await parseLcov(lcovFile, workingDirectory);
        const changedFiles = await getChangedFiles(octokit);

        const allFilesLcov = sumLcov(data);
        const allFilesPassed = isPassed(allFilesLcov, allFilesMinimumCoverage);
        const changedFilesLcov = sumLcov(data, changedFiles);
        const hasChangedFiles = changedFilesLcov != undefined;
        const changedFilesPassed = isPassed(changedFilesLcov, changedFilesMinimumCoverage);
        const bothPassed = allFilesPassed && (!hasChangedFiles || changedFilesPassed);
        if (!bothPassed) {
            core.setFailed('Coverage is below the minimum');
        }
        console.log(`allFilesPassed: ${allFilesPassed}`);
        console.log(`hasChangedFiles: ${hasChangedFiles}`);
        console.log(`changedFilesPassed: ${changedFilesPassed}`);
        console.log(`bothPassed: ${bothPassed}`);

        const commentId = renderCommentId(commentTitle);

        const comment = commentId +
            renderCommentHeader(commentTitle, bothPassed) +
            renderSectionHeader('All Files') +
            renderLcovOverall(allFilesLcov, allFilesMinimumCoverage, allFilesPassed) +
            renderSectionHeader('Changed Files') +
            renderLcovOverall(changedFilesLcov, changedFilesMinimumCoverage, changedFilesPassed) +
            renderLcovFiles(data, changedFiles);
        console.log(comment);

        if (github.context.eventName == 'pull_request') {
            await postComment(octokit, commentId, comment);
        } else {
            console.log('Skipped posting comment');
        };

        if (artifactName != '') {
            uploadArtifact(lcovFile, artifactName, workingDirectory);
        } else {
            console.log('Skipped uploading artifact');
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();

async function getChangedFiles(octokit) {
    if (github.context.eventName != 'pull_request') return new Set();
    console.log('Getting changed files...');
    const { data: { files: files } } = await octokit.rest.repos.compareCommitsWithBasehead({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        basehead: `${github.context.payload.pull_request.base.sha}...${github.context.payload.pull_request.head.sha}`,
        per_page: 1,
    });
    const fileNames = files.map((file) => path.resolve(file.filename));
    console.log(`Changed files: ${JSON.stringify(fileNames)}`)
    return new Set(fileNames);
}

async function postComment(octokit, commentId, comment) {
    const comments = await getComments(octokit);
    const existingComment = comments.find((comment) => comment.body.startsWith(commentId));
    if (existingComment == undefined) {
        console.log(`Existing comment is not found, creating new comment...`);
        await createNewComment(octokit, comment);
    } else {
        console.log(`Existing comment is found, updating existing comment...`);
        await updateComment(octokit, existingComment, comment);
    }
}

async function getComments(octokit) {
    if (github.context.eventName != 'pull_request') return [];
    console.log('Getting comments...');
    const { data: comments } = await octokit.rest.issues.listComments({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.payload.pull_request.number,
        per_page: 100,
    });
    console.log(`Comments: ${JSON.stringify(comments.map((comment) => comment.body))}`);
    return comments;
}

async function createNewComment(octokit, comment) {
    await octokit.rest.issues.createComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        issue_number: github.context.payload.pull_request.number,
        body: comment,
    });
}

async function updateComment(octokit, existingComment, comment) {
    await octokit.rest.issues.updateComment({
        owner: github.context.repo.owner,
        repo: github.context.repo.repo,
        comment_id: existingComment.id,
        body: comment,
    });
}

async function parseLcov(lcovFile, workingDirectory) {
    console.log('Parsing coverage file...');
    return new Promise(resolve => {
        lcovParse(lcovFile, function (err, data) {
            if (err != null) {
                throw new Error(`Error parsing lcov file ${lcovFile}: ${err}`);
            }
            resolve(data.map((item) => {
                item.file = path.resolve(workingDirectory, item.file);
                return item;
            }));
        });
    })
}

function sumLcov(data, files) {
    if (files != undefined) {
        data = data.filter((item) => files.has(item.file));
    }

    if (data.length == 0) {
        return undefined;
    }

    const sum = data.reduce((total, file) => {
        const newTotal = JSON.parse(JSON.stringify(total));
        newTotal.lines.found += file.lines.found;
        newTotal.lines.hit += file.lines.hit;
        newTotal.functions.found += file.functions.found;
        newTotal.functions.hit += file.functions.hit;
        newTotal.branches.found += file.branches.found;
        newTotal.branches.hit += file.branches.hit;
        return newTotal;
    });

    return sum;
}

function isPassed(data, minimumCoverage) {
    var coverage;
    if (data == undefined || data.lines.found == 0) {
        coverage = 0.0;
    } else {
        coverage = data.lines.hit * 100 / data.lines.found
    }
    return coverage >= minimumCoverage;
}

function renderLcovOverall(data, minimumCoverage, isPassed) {
    if (data == undefined) {
        return 'N/A\n'
    }
    const output =
        `- Lines: ${renderLcovPercentage(data.lines)} ${renderPassed(isPassed)} (Minimum coverage is ${minimumCoverage}%)\n` +
        `- Functions: ${renderLcovPercentage(data.functions)}\n` +
        `- Branches: ${renderLcovPercentage(data.branches)}\n` +
        '\n';

    return output;
}

function renderLcovFiles(data, files) {
    if (files != undefined) {
        data = data.filter((item) => files.has(item.file));
    }

    if (data.length == 0) {
        return '';
    }

    const table = [['File', 'Lines', 'Functions', 'Branches']];

    data.forEach(item => {
        table.push(
            [
                path.basename(item.file),
                renderLcovPercentage(item.lines),
                renderLcovPercentage(item.functions),
                renderLcovPercentage(item.branches),
            ]
        )
    });

    return markdownTable(table);
}

function renderLcovPercentage(lcov) {
    const hit = lcov.hit;
    const found = lcov.found;
    if (found == 0) return 'N/A';
    const percentage = (hit * 100 / found).toFixed(1);
    return `${hit}/${found} (${percentage}%)`
}

function renderCommentId(title) {
    return `[lcov-comment-id]: <> (${title})\n`
}

function renderCommentHeader(title, isPassed) {
    return `## LCOV Report${title !== '' ? ` - ${title}` : ''} ${renderPassed(isPassed)}\n`
}

function renderSectionHeader(title) {
    return `### ${title}\n`;
}

function renderPassed(isPassed) {
    if (isPassed) {
        return '✅';
    } else {
        return '❌';
    }
}

async function uploadArtifact(lcovFile, artifactName, workingDirectory) {
    const artifact = new DefaultArtifactClient();
    const artifactPath = path.resolve(uuidv4());
    await exec.exec(`genhtml ${lcovFile} -o ${artifactPath}`, [], { cwd: workingDirectory })
    const globber = await glob.create(`${artifactPath}/**`);
    const files = await globber.glob();
    console.log('Uploading artifact...');
    console.log(`name: ${artifactName}, files: ${files}, rootDirectory: ${artifactPath}`);
    await artifact.uploadArtifact(artifactName, files, artifactPath);
}