# LCOV Pull Request Report
Action for reporting LCOV code coverage on pull requests

# Sample Report

## LCOV Report - Todo App ✅
### All Files
- Lines: 1440/1842 (78.2%) ✅ (Minimum coverage is 70%)
- Functions: N/A
- Branches: N/A

### Changed Files
- Lines: 50/50 (100.0%) ✅ (Minimum coverage is 90%)
- Functions: N/A
- Branches: N/A

| File              | Lines          | Functions | Branches |
| ----------------- | -------------- | --------- | -------- |
| app_user.dart     | 7/7 (100.0%)   | N/A       | N/A      |
| cart_service.dart | 43/43 (100.0%) | N/A       | N/A      |

# Usage
```yml
# Required for generating html artifact, can be skipped if not generating html artifact
- uses: hrishikesh-kadam/setup-lcov@v1 

- uses: kefasjw/lcov-pull-request-report@v1
  with:
    # Lcov file location. For example, coverage/lcov.info
    lcov-file: coverage/lcov.info

    # Github token required for getting list of changed files and posting comments
    github-token: ${{ secrets.GITHUB_TOKEN }}
    
    # Working directory
    # Default: empty (repository root)
    working-directory:

    # Report comment title
    # Default: empty
    comment-title:

    # All files minimum coverage in percentage. For example, 0, 50, 100
    # Default: 0
    all-files-minimum-coverage:

    # Changed files minimum coverage in percentage. For example, 0, 50, 100
    # Default: 0
    changed-files-minimum-coverage:

    # Artifact name of the generated html. Requires LCOV to be installed
    # Default: empty (skip uploading artifact)
    artifact-name:
```

# Permissions

Write permission must be given for writing pull request comment. There are 2 ways:
- Enable "Read and write permissions" in Repository Settings > Code and automation > Actions > General > Workflow permissions, or
- Add `permissions: write-all` to the job. See https://docs.github.com/en/actions/using-jobs/assigning-permissions-to-jobs

# License

The scripts and documentation in this project are released under the [MIT License](LICENSE)