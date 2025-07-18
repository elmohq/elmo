"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type JobResult = {
	success: boolean;
	jobId?: string;
	jobName?: string;
	data?: any;
	queue?: string;
	brandId?: string;
	error?: string;
};

type PromptJobResult = {
	success: boolean;
	jobId?: string;
	promptId?: string;
	promptValue?: string;
	message?: string;
	error?: string;
};

export default function QueueDebug() {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [jobResult, setJobResult] = useState<JobResult | null>(null);
	const [jobName, setJobName] = useState("test-job");
	const [message, setMessage] = useState("Hello from debug page!");
	const [delay, setDelay] = useState(0);
	const [selectedQueue, setSelectedQueue] = useState("auto");
	const [brandId, setBrandId] = useState("whitelabel-client"); // Default brand ID for testing

	// New state for prompt queue runs
	const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
	const [promptJobResult, setPromptJobResult] = useState<PromptJobResult | null>(null);
	const [promptId, setPromptId] = useState("4f7bedc1-655e-45cd-ad03-f0b8b10f0edc");

	const submitJob = async () => {
		setIsSubmitting(true);
		setJobResult(null);

		try {
			const response = await fetch("/api/queue/submit-job", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					jobName,
					jobData: {
						message,
						submittedBy: "debug-page",
						customData: {
							example: "data",
							timestamp: new Date().toISOString(),
						},
					},
					delay: delay * 1000, // Convert seconds to milliseconds
					queue: selectedQueue === "auto" ? undefined : selectedQueue,
					brandId, // Include brandId for authorization
				}),
			});

			const result = await response.json();
			setJobResult(result);
		} catch (error) {
			setJobResult({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	const submitPromptJob = async () => {
		setIsSubmittingPrompt(true);
		setPromptJobResult(null);

		try {
			const response = await fetch("/api/queue/process-prompt", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					promptId,
				}),
			});

			const result = await response.json();
			setPromptJobResult(result);
		} catch (error) {
			setPromptJobResult({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsSubmittingPrompt(false);
		}
	};

	const submitPresetJob = async (preset: string) => {
		setIsSubmitting(true);
		setJobResult(null);

		const presets = {
			"quick-test": {
				jobName: "quick-test",
				jobData: { message: "Quick test job", type: "test" },
				delay: 0,
			},
			"delayed-job": {
				jobName: "delayed-job",
				jobData: { message: "This job was delayed", type: "delayed" },
				delay: 10000, // 10 seconds
			},
			"data-processing": {
				jobName: "data-processing",
				jobData: {
					message: "Processing sample data",
					type: "processing",
					data: { items: [1, 2, 3, 4, 5] },
				},
				delay: 0,
			},
		};

		try {
			const response = await fetch("/api/queue/submit-job", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					...presets[preset as keyof typeof presets],
					queue: selectedQueue === "auto" ? undefined : selectedQueue,
					brandId, // Include brandId for authorization
				}),
			});

			const result = await response.json();
			setJobResult(result);
		} catch (error) {
			setJobResult({
				success: false,
				error: error instanceof Error ? error.message : "Unknown error",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>Queue Debug</CardTitle>
				<CardDescription>Submit test jobs to the BullMQ queue for testing</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Brand ID Configuration */}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Authorization</h3>
					<div className="space-y-2">
						<Label htmlFor="brand-id">Brand ID</Label>
						<Input
							id="brand-id"
							value={brandId}
							onChange={(e) => setBrandId(e.target.value)}
							placeholder="Enter brand ID"
						/>
						<p className="text-xs text-muted-foreground">
							Required for authorization. Use a brand ID you have access to.
						</p>
					</div>
				</div>

				{/* Prompt Processing Section */}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Process Prompt</h3>
					<div className="space-y-2">
						<Label htmlFor="prompt-id">Prompt ID</Label>
						<Input
							id="prompt-id"
							value={promptId}
							onChange={(e) => setPromptId(e.target.value)}
							placeholder="Enter prompt ID"
						/>
					</div>
					<Button onClick={submitPromptJob} disabled={isSubmittingPrompt} className="w-full">
						{isSubmittingPrompt ? "Processing..." : "Run Prompt Analysis"}
					</Button>
					
					{/* Prompt Job Result */}
					{promptJobResult && (
						<div
							className={`p-4 rounded-md ${
								promptJobResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
							}`}
						>
							{promptJobResult.success ? (
								<div className="space-y-1">
									<p className="text-green-800 font-medium">✅ Prompt job submitted successfully!</p>
									<p className="text-sm text-green-700">Job ID: {promptJobResult.jobId}</p>
									<p className="text-sm text-green-700">Prompt ID: {promptJobResult.promptId}</p>
									<p className="text-sm text-green-700">Prompt: {promptJobResult.promptValue}</p>
									<p className="text-sm text-green-700">{promptJobResult.message}</p>
								</div>
							) : (
								<div>
									<p className="text-red-800 font-medium">❌ Prompt job submission failed</p>
									<p className="text-sm text-red-700">Error: {promptJobResult.error}</p>
								</div>
							)}
						</div>
					)}
				</div>

				{/* Custom Job Form */}
				<div className="space-y-4">
					<h3 className="text-lg font-semibold">Submit Custom Job</h3>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="job-name">Job Name</Label>
							<Input
								id="job-name"
								value={jobName}
								onChange={(e) => setJobName(e.target.value)}
								placeholder="job-name"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="delay">Delay (seconds)</Label>
							<Input
								id="delay"
								type="number"
								value={delay}
								onChange={(e) => setDelay(Number(e.target.value))}
								min={0}
								placeholder="0"
							/>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="message">Message</Label>
						<Input
							id="message"
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="Your test message"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="queue">Target Queue</Label>
						<Select value={selectedQueue} onValueChange={setSelectedQueue}>
							<SelectTrigger>
								<SelectValue placeholder="Select queue" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="auto">Auto (Environment)</SelectItem>
								<SelectItem value="dev">Development Queue</SelectItem>
								<SelectItem value="prod">Production Queue</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<Button onClick={submitJob} disabled={isSubmitting} className="w-full">
						{isSubmitting ? "Submitting..." : "Submit Custom Job"}
					</Button>
				</div>

				{/* Preset Jobs */}
				<div className="space-y-4">
					<div className="flex items-center justify-between">
						<h3 className="text-lg font-semibold">Preset Jobs</h3>
						<span className="text-sm text-gray-500">
							Queue: {selectedQueue === "auto" ? "Auto (Environment)" : selectedQueue.toUpperCase()}
						</span>
					</div>
					<div className="grid grid-cols-3 gap-2">
						<Button
							variant="outline"
							onClick={() => submitPresetJob("quick-test")}
							disabled={isSubmitting}
						>
							Quick Test
						</Button>
						<Button
							variant="outline"
							onClick={() => submitPresetJob("delayed-job")}
							disabled={isSubmitting}
						>
							Delayed Job (10s)
						</Button>
						<Button
							variant="outline"
							onClick={() => submitPresetJob("data-processing")}
							disabled={isSubmitting}
						>
							Data Processing
						</Button>
					</div>
				</div>

				{/* Job Result */}
				{jobResult && (
					<div className="space-y-2">
						<h3 className="text-lg font-semibold">Last Job Result</h3>
						<div
							className={`p-4 rounded-md ${
								jobResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"
							}`}
						>
							{jobResult.success ? (
								<div className="space-y-1">
									<p className="text-green-800 font-medium">✅ Job submitted successfully!</p>
									<p className="text-sm text-green-700">Job ID: {jobResult.jobId}</p>
									<p className="text-sm text-green-700">Job Name: {jobResult.jobName}</p>
									<p className="text-sm text-green-700">Queue: {jobResult.queue}</p>
									<p className="text-sm text-green-700">Brand ID: {jobResult.brandId}</p>
								</div>
							) : (
								<div>
									<p className="text-red-800 font-medium">❌ Job submission failed</p>
									<p className="text-sm text-red-700">Error: {jobResult.error}</p>
								</div>
							)}
						</div>
					</div>
				)}

				{/* Instructions */}
				<div className="space-y-2">
					<h3 className="text-lg font-semibold">Instructions</h3>
					<div className="text-sm text-gray-600 space-y-1">
						<p>• Jobs are submitted to BullMQ for background processing</p>
						<p>• You can monitor job progress and results through the queue dashboard</p>
						<p>• Delayed jobs will be processed after the specified delay</p>
						<p>• All jobs now require a valid Brand ID for authorization</p>
						<p>• You can only submit jobs for brands you have access to</p>
					</div>
				</div>
			</CardContent>
		</Card>
	);
} 